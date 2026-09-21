import { z } from 'zod'
import { errResult, okResult, type RegisteredTool } from './types'
import { browserSession } from './browserSession'

const UrlArgs = z.object({ url: z.string().url() })
const SelectorArgs = z.object({
  selector: z.string().min(1),
  timeoutMs: z.number().int().positive().optional()
})
const TypeArgs = z.object({
  selector: z.string().min(1),
  text: z.string(),
  clear: z.boolean().optional()
})
const PressArgs = z.object({
  key: z.string().min(1),
  selector: z.string().optional()
})
const ScrollArgs = z.object({
  dy: z.number().default(600),
  selector: z.string().optional()
})
const WaitArgs = z.object({
  selector: z.string().optional(),
  urlIncludes: z.string().optional(),
  timeoutMs: z.number().int().positive().optional()
})
const TabArgs = z.object({ index: z.number().int().nonnegative() })
const UploadArgs = z.object({
  selector: z.string().min(1),
  filePath: z.string().min(1)
})
const PublishArgs = z.object({
  text: z.string().min(1),
  composerSelector: z.string().default('[role="textbox"], textarea, [contenteditable="true"]'),
  submitSelector: z.string().optional()
})

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

export const browserTools: RegisteredTool[] = [
  {
    name: 'browser_open_url',
    description: 'Open a URL in the persistent browser profile (logins survive restarts).',
    risk: 'safe',
    timeoutMs: 60_000,
    parameters: UrlArgs,
    jsonSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url']
    },
    preview: (a) => `Open URL: ${String(a.url ?? '')}`,
    execute: wrap(async (raw) => {
      const args = UrlArgs.parse(raw)
      const page = await browserSession.getPage()
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      return okResult(`Opened ${page.url()}\nTitle: ${await page.title()}`)
    })
  },
  {
    name: 'browser_click',
    description: 'Click an element by CSS selector.',
    risk: 'risky',
    timeoutMs: 30_000,
    parameters: SelectorArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        timeoutMs: { type: 'number' }
      },
      required: ['selector']
    },
    preview: (a) => `Click: ${String(a.selector ?? '')}`,
    execute: wrap(async (raw) => {
      const args = SelectorArgs.parse(raw)
      const page = await browserSession.getPage()
      await page.click(args.selector, { timeout: args.timeoutMs ?? 15_000 })
      return okResult(`Clicked ${args.selector}`)
    })
  },
  {
    name: 'browser_type',
    description: 'Type text into an element (optionally clear first).',
    risk: 'risky',
    timeoutMs: 30_000,
    parameters: TypeArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        clear: { type: 'boolean' }
      },
      required: ['selector', 'text']
    },
    preview: (a) => `Type into ${String(a.selector ?? '')}:\n${String(a.text ?? '').slice(0, 500)}`,
    execute: wrap(async (raw) => {
      const args = TypeArgs.parse(raw)
      const page = await browserSession.getPage()
      if (args.clear) await page.fill(args.selector, '')
      await page.fill(args.selector, args.text)
      return okResult(`Typed into ${args.selector}`)
    })
  },
  {
    name: 'browser_press',
    description: 'Press a keyboard key (optionally focused on a selector).',
    risk: 'risky',
    timeoutMs: 15_000,
    parameters: PressArgs,
    jsonSchema: {
      type: 'object',
      properties: { key: { type: 'string' }, selector: { type: 'string' } },
      required: ['key']
    },
    preview: (a) => `Press key: ${String(a.key ?? '')}`,
    execute: wrap(async (raw) => {
      const args = PressArgs.parse(raw)
      const page = await browserSession.getPage()
      if (args.selector) await page.press(args.selector, args.key)
      else await page.keyboard.press(args.key)
      return okResult(`Pressed ${args.key}`)
    })
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page or an element by dy pixels.',
    risk: 'safe',
    timeoutMs: 10_000,
    parameters: ScrollArgs,
    jsonSchema: {
      type: 'object',
      properties: { dy: { type: 'number' }, selector: { type: 'string' } }
    },
    preview: (a) => `Scroll dy=${String(a.dy ?? 600)}`,
    execute: wrap(async (raw) => {
      const args = ScrollArgs.parse(raw)
      const page = await browserSession.getPage()
      if (args.selector) {
        await page.locator(args.selector).evaluate((el, dy) => {
          ;(el as HTMLElement).scrollBy(0, dy as number)
        }, args.dy)
      } else {
        await page.mouse.wheel(0, args.dy)
      }
      return okResult(`Scrolled ${args.dy}px`)
    })
  },
  {
    name: 'browser_screenshot',
    description: 'Capture a PNG screenshot of the active tab (base64 length reported).',
    risk: 'safe',
    timeoutMs: 20_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'Browser screenshot',
    execute: wrap(async () => {
      const b64 = await browserSession.screenshotBase64()
      return okResult(`Screenshot captured (${Math.round(b64.length / 1024)} KB base64)`, {
        mimeType: 'image/png',
        data: b64.slice(0, 64) + '…'
      })
    })
  },
  {
    name: 'browser_get_dom_snapshot',
    description: 'Get a truncated accessibility/DOM text snapshot of the page for reasoning.',
    risk: 'safe',
    timeoutMs: 30_000,
    parameters: z.object({ maxChars: z.number().int().positive().max(100_000).optional() }),
    jsonSchema: {
      type: 'object',
      properties: { maxChars: { type: 'number' } }
    },
    preview: () => 'DOM snapshot',
    execute: wrap(async (raw) => {
      const maxChars = z.object({ maxChars: z.number().optional() }).parse(raw).maxChars ?? 12_000
      const page = await browserSession.getPage()
      const snapshot = await page.locator('body').innerText({ timeout: 15_000 })
      const text = snapshot.slice(0, maxChars)
      return okResult(
        `URL: ${page.url()}\nTitle: ${await page.title()}\n\nUNTRUSTED PAGE TEXT:\n${text}`
      )
    })
  },
  {
    name: 'browser_wait_for',
    description: 'Wait for a selector and/or URL substring.',
    risk: 'safe',
    timeoutMs: 60_000,
    parameters: WaitArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        urlIncludes: { type: 'string' },
        timeoutMs: { type: 'number' }
      }
    },
    preview: (a) =>
      `Wait for ${String(a.selector ?? '')} ${String(a.urlIncludes ?? '')}`.trim(),
    execute: wrap(async (raw) => {
      const args = WaitArgs.parse(raw)
      const page = await browserSession.getPage()
      const timeout = args.timeoutMs ?? 30_000
      if (args.selector) await page.waitForSelector(args.selector, { timeout })
      if (args.urlIncludes) {
        await page.waitForURL((url) => url.toString().includes(args.urlIncludes!), { timeout })
      }
      if (!args.selector && !args.urlIncludes) await page.waitForTimeout(Math.min(timeout, 2000))
      return okResult(`Wait complete. URL: ${page.url()}`)
    })
  },
  {
    name: 'browser_tabs_list',
    description: 'List open browser tabs (index, title, url).',
    risk: 'safe',
    timeoutMs: 10_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'List tabs',
    execute: wrap(async () => {
      const pages = await browserSession.listPages()
      const lines = await Promise.all(
        pages.map(async (p, i) => `${i}: ${await p.title()} — ${p.url()}`)
      )
      return okResult(lines.join('\n') || '(no tabs)')
    })
  },
  {
    name: 'browser_tabs_open',
    description: 'Open a new tab, optionally navigating to a URL.',
    risk: 'safe',
    timeoutMs: 60_000,
    parameters: z.object({ url: z.string().url().optional() }),
    jsonSchema: {
      type: 'object',
      properties: { url: { type: 'string' } }
    },
    preview: (a) => `New tab ${String(a.url ?? '')}`,
    execute: wrap(async (raw) => {
      const url = z.object({ url: z.string().url().optional() }).parse(raw).url
      const page = await browserSession.newTab(url)
      return okResult(`Opened tab: ${page.url()}`)
    })
  },
  {
    name: 'browser_tabs_focus',
    description: 'Focus a tab by index from browser_tabs_list.',
    risk: 'safe',
    timeoutMs: 10_000,
    parameters: TabArgs,
    jsonSchema: {
      type: 'object',
      properties: { index: { type: 'number' } },
      required: ['index']
    },
    preview: (a) => `Focus tab ${String(a.index ?? '')}`,
    execute: wrap(async (raw) => {
      const args = TabArgs.parse(raw)
      const page = await browserSession.setActivePage(args.index)
      return okResult(`Focused tab ${args.index}: ${page.url()}`)
    })
  },
  {
    name: 'browser_upload_file',
    description: 'Set files on an <input type=file> selector.',
    risk: 'risky',
    timeoutMs: 30_000,
    parameters: UploadArgs,
    jsonSchema: {
      type: 'object',
      properties: { selector: { type: 'string' }, filePath: { type: 'string' } },
      required: ['selector', 'filePath']
    },
    preview: (a) => `Upload ${String(a.filePath ?? '')} → ${String(a.selector ?? '')}`,
    execute: wrap(async (raw) => {
      const args = UploadArgs.parse(raw)
      const page = await browserSession.getPage()
      await page.setInputFiles(args.selector, args.filePath)
      return okResult(`Uploaded file to ${args.selector}`)
    })
  },
  {
    name: 'browser_publish_text',
    description:
      'CRITICAL: Type text into a composer and optionally click submit/post. Always requires approval with exact post preview (e.g. Facebook-style posts).',
    risk: 'critical',
    timeoutMs: 60_000,
    parameters: PublishArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        composerSelector: { type: 'string' },
        submitSelector: { type: 'string' }
      },
      required: ['text']
    },
    preview: (a) =>
      `PUBLISH / POST — exact text:\n---\n${String(a.text ?? '')}\n---\ncomposer: ${String(a.composerSelector ?? '')}\nsubmit: ${String(a.submitSelector ?? '(none — type only)')}`,
    execute: wrap(async (raw) => {
      const args = PublishArgs.parse(raw)
      const page = await browserSession.getPage()
      const composer = page.locator(args.composerSelector).first()
      await composer.click({ timeout: 15_000 })
      await composer.fill(args.text)
      if (args.submitSelector) {
        await page.click(args.submitSelector, { timeout: 15_000 })
        return okResult(`Published text via ${args.submitSelector}`)
      }
      return okResult('Text entered into composer (no submitSelector — not clicked Post)')
    })
  }
]
