import { screen as electronScreen, desktopCapturer } from 'electron'
import {
  mouse,
  keyboard,
  Button,
  Key,
  straightTo,
  Point
} from '@nut-tree-fork/nut-js'
import { z } from 'zod'
import { errResult, okResult, type RegisteredTool } from './types'

mouse.config.autoDelayMs = 20
keyboard.config.autoDelayMs = 10

const PointArgs = z.object({
  x: z.number(),
  y: z.number(),
  /** Coordinates are relative to a screenshot size (vision grounding) */
  imageWidth: z.number().positive().optional(),
  imageHeight: z.number().positive().optional()
})

const DragArgs = PointArgs.extend({
  toX: z.number(),
  toY: z.number()
})

const TypeArgs = z.object({ text: z.string() })
const HotkeyArgs = z.object({
  keys: z.array(z.string()).min(1)
})
const ScrollArgs = z.object({
  dy: z.number().default(-3),
  dx: z.number().default(0)
})

function scalePoint(
  x: number,
  y: number,
  imageWidth?: number,
  imageHeight?: number
): { x: number; y: number } {
  const display = electronScreen.getPrimaryDisplay()
  const { width, height } = display.size
  const factor = display.scaleFactor || 1
  // Logical size for mouse APIs is typically size (DIP); nut.js often wants screen coords
  const screenW = width
  const screenH = height

  if (imageWidth && imageHeight) {
    return {
      x: Math.round((x / imageWidth) * screenW),
      y: Math.round((y / imageHeight) * screenH)
    }
  }
  // If model returns physical pixels, divide by scaleFactor
  return {
    x: Math.round(x / (factor > 1 && x > screenW ? factor : 1)),
    y: Math.round(y / (factor > 1 && y > screenH ? factor : 1))
  }
}

const KEY_MAP: Record<string, Key> = {
  enter: Key.Enter,
  return: Key.Enter,
  tab: Key.Tab,
  escape: Key.Escape,
  esc: Key.Escape,
  backspace: Key.Backspace,
  delete: Key.Delete,
  space: Key.Space,
  ctrl: Key.LeftControl,
  control: Key.LeftControl,
  alt: Key.LeftAlt,
  shift: Key.LeftShift,
  meta: Key.LeftSuper,
  cmd: Key.LeftSuper,
  command: Key.LeftSuper,
  up: Key.Up,
  down: Key.Down,
  left: Key.Left,
  right: Key.Right
}

function resolveKey(name: string): Key {
  const k = KEY_MAP[name.toLowerCase()]
  if (k !== undefined) return k
  if (name.length === 1) {
    const upper = name.toUpperCase()
    const keyed = (Key as unknown as Record<string, Key>)[upper]
    if (keyed !== undefined) return keyed
  }
  throw new Error(`Unknown key: ${name}`)
}

function wrap(
  fn: (args: Record<string, unknown>) => Promise<ReturnType<typeof okResult>>
): RegisteredTool['execute'] {
  return async (raw) => {
    try {
      return await fn(raw)
    } catch (err) {
      return errResult(err instanceof Error ? err.message : String(err))
    }
  }
}

export async function captureScreenPng(): Promise<{
  base64: string
  width: number
  height: number
  scaleFactor: number
}> {
  const display = electronScreen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.min(1280, display.size.width),
      height: Math.min(800, display.size.height)
    }
  })
  const primary =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!primary) throw new Error('No screen source available')
  const png = primary.thumbnail.toPNG()
  const size = primary.thumbnail.getSize()
  return {
    base64: png.toString('base64'),
    width: size.width,
    height: size.height,
    scaleFactor: display.scaleFactor
  }
}

export const screenTools: RegisteredTool[] = [
  {
    name: 'screen_screenshot',
    description:
      'Capture the primary screen (downscaled). Returns size metadata for vision grounding coordinates.',
    risk: 'safe',
    timeoutMs: 15_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'Screen screenshot',
    execute: wrap(async () => {
      const shot = await captureScreenPng()
      return okResult(
        `Screenshot ${shot.width}x${shot.height} (scaleFactor=${shot.scaleFactor}). Use these dimensions when grounding click coordinates.`,
        {
          width: shot.width,
          height: shot.height,
          scaleFactor: shot.scaleFactor,
          mimeType: 'image/png',
          // Keep meta small in tool result text path; live preview uses dedicated IPC
          bytes: Math.round(shot.base64.length * 0.75)
        }
      )
    })
  },
  {
    name: 'screen_click',
    description:
      'Click at screen coordinates. If imageWidth/imageHeight are set, x/y are relative to that screenshot (vision models).',
    risk: 'risky',
    timeoutMs: 10_000,
    parameters: PointArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        imageWidth: { type: 'number' },
        imageHeight: { type: 'number' }
      },
      required: ['x', 'y']
    },
    preview: (a) => `Screen click (${String(a.x)}, ${String(a.y)})`,
    execute: wrap(async (raw) => {
      const args = PointArgs.parse(raw)
      const p = scalePoint(args.x, args.y, args.imageWidth, args.imageHeight)
      await mouse.setPosition(new Point(p.x, p.y))
      await mouse.click(Button.LEFT)
      return okResult(`Clicked at ${p.x},${p.y}`)
    })
  },
  {
    name: 'screen_double_click',
    description: 'Double-click at coordinates (supports vision image scaling).',
    risk: 'risky',
    timeoutMs: 10_000,
    parameters: PointArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        imageWidth: { type: 'number' },
        imageHeight: { type: 'number' }
      },
      required: ['x', 'y']
    },
    preview: (a) => `Double-click (${String(a.x)}, ${String(a.y)})`,
    execute: wrap(async (raw) => {
      const args = PointArgs.parse(raw)
      const p = scalePoint(args.x, args.y, args.imageWidth, args.imageHeight)
      await mouse.setPosition(new Point(p.x, p.y))
      await mouse.doubleClick(Button.LEFT)
      return okResult(`Double-clicked at ${p.x},${p.y}`)
    })
  },
  {
    name: 'screen_drag',
    description: 'Drag from (x,y) to (toX,toY), with optional vision scaling.',
    risk: 'risky',
    timeoutMs: 15_000,
    parameters: DragArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        toX: { type: 'number' },
        toY: { type: 'number' },
        imageWidth: { type: 'number' },
        imageHeight: { type: 'number' }
      },
      required: ['x', 'y', 'toX', 'toY']
    },
    preview: (a) => `Drag (${a.x},${a.y}) → (${a.toX},${a.toY})`,
    execute: wrap(async (raw) => {
      const args = DragArgs.parse(raw)
      const from = scalePoint(args.x, args.y, args.imageWidth, args.imageHeight)
      const to = scalePoint(args.toX, args.toY, args.imageWidth, args.imageHeight)
      await mouse.setPosition(new Point(from.x, from.y))
      await mouse.pressButton(Button.LEFT)
      await mouse.move(straightTo(new Point(to.x, to.y)))
      await mouse.releaseButton(Button.LEFT)
      return okResult(`Dragged to ${to.x},${to.y}`)
    })
  },
  {
    name: 'screen_type_text',
    description: 'Type text via OS keyboard (last resort vs browser DOM tools).',
    risk: 'risky',
    timeoutMs: 60_000,
    parameters: TypeArgs,
    jsonSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    },
    preview: (a) => `Type text:\n${String(a.text ?? '').slice(0, 400)}`,
    execute: wrap(async (raw) => {
      const args = TypeArgs.parse(raw)
      await keyboard.type(args.text)
      return okResult(`Typed ${args.text.length} chars`)
    })
  },
  {
    name: 'screen_hotkey',
    description: 'Press a hotkey chord, e.g. keys: ["ctrl","c"].',
    risk: 'risky',
    timeoutMs: 10_000,
    parameters: HotkeyArgs,
    jsonSchema: {
      type: 'object',
      properties: { keys: { type: 'array', items: { type: 'string' } } },
      required: ['keys']
    },
    preview: (a) => `Hotkey: ${(a.keys as string[] | undefined)?.join('+') ?? ''}`,
    execute: wrap(async (raw) => {
      const args = HotkeyArgs.parse(raw)
      const keys = args.keys.map(resolveKey)
      await keyboard.pressKey(...keys)
      await keyboard.releaseKey(...keys)
      return okResult(`Hotkey ${args.keys.join('+')}`)
    })
  },
  {
    name: 'screen_scroll',
    description: 'Scroll mouse wheel (dy negative = up).',
    risk: 'safe',
    timeoutMs: 5_000,
    parameters: ScrollArgs,
    jsonSchema: {
      type: 'object',
      properties: { dy: { type: 'number' }, dx: { type: 'number' } }
    },
    preview: (a) => `Scroll dy=${String(a.dy ?? -3)}`,
    execute: wrap(async (raw) => {
      const args = ScrollArgs.parse(raw)
      if (args.dy !== 0) {
        if (args.dy < 0) await mouse.scrollUp(Math.abs(args.dy))
        else await mouse.scrollDown(args.dy)
      }
      if (args.dx !== 0) {
        if (args.dx < 0) await mouse.scrollLeft(Math.abs(args.dx))
        else await mouse.scrollRight(args.dx)
      }
      return okResult(`Scrolled dx=${args.dx} dy=${args.dy}`)
    })
  },
  {
    name: 'screen_get_active_window',
    description: 'Get active display bounds and cursor position (window title APIs are best-effort).',
    risk: 'safe',
    timeoutMs: 5_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'Get active window / cursor',
    execute: wrap(async () => {
      const display = electronScreen.getPrimaryDisplay()
      const pos = await mouse.getPosition()
      return okResult(
        JSON.stringify(
          {
            cursor: pos,
            display: {
              id: display.id,
              bounds: display.bounds,
              size: display.size,
              scaleFactor: display.scaleFactor
            }
          },
          null,
          2
        )
      )
    })
  },
  {
    name: 'screen_list_windows',
    description: 'List displays (multi-monitor). Per-window titles require OS helpers — returns displays for now.',
    risk: 'safe',
    timeoutMs: 5_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'List displays',
    execute: wrap(async () => {
      const displays = electronScreen.getAllDisplays().map((d) => ({
        id: d.id,
        bounds: d.bounds,
        size: d.size,
        scaleFactor: d.scaleFactor,
        primary: d.id === electronScreen.getPrimaryDisplay().id
      }))
      return okResult(JSON.stringify(displays, null, 2))
    })
  },
  {
    name: 'screen_focus_window',
    description: 'Move mouse to a display center (focus proxy). Full window focus is OS-specific.',
    risk: 'risky',
    timeoutMs: 5_000,
    parameters: z.object({ displayId: z.number().optional() }),
    jsonSchema: {
      type: 'object',
      properties: { displayId: { type: 'number' } }
    },
    preview: (a) => `Focus display ${String(a.displayId ?? 'primary')}`,
    execute: wrap(async (raw) => {
      const displayId = z.object({ displayId: z.number().optional() }).parse(raw).displayId
      const display =
        electronScreen.getAllDisplays().find((d) => d.id === displayId) ??
        electronScreen.getPrimaryDisplay()
      const x = display.bounds.x + Math.floor(display.bounds.width / 2)
      const y = display.bounds.y + Math.floor(display.bounds.height / 2)
      await mouse.setPosition(new Point(x, y))
      await mouse.click(Button.LEFT)
      return okResult(`Focused display ${display.id} at ${x},${y}`)
    })
  }
]

import { parseGroundingCoordinates } from './grounding'
