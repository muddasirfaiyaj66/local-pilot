import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { z } from 'zod'
import { errResult, okResult, type RegisteredTool, type ToolContext } from './types'
import { resolveInWorkspace, WorkspaceError } from './workspace'

function ffmpegPath(): string {
  try {
    // Resolved at runtime; package exports a string path to the binary
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null
    if (p && existsSync(p)) return p
  } catch {
    // fall through
  }
  return 'ffmpeg'
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath()
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('ffmpeg timed out'))
    }, timeoutMs)
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stderr.slice(-2000) || 'ok')
      else reject(new Error(stderr.slice(-2000) || `ffmpeg exit ${code}`))
    })
  })
}

const TrimArgs = z.object({
  input: z.string(),
  output: z.string(),
  startSec: z.number().nonnegative().default(0),
  durationSec: z.number().positive().optional(),
  endSec: z.number().positive().optional()
})

const ConvertArgs = z.object({
  input: z.string(),
  output: z.string()
})

const SubtitleArgs = z.object({
  input: z.string(),
  output: z.string(),
  srtPath: z.string()
})

const ConcatArgs = z.object({
  inputs: z.array(z.string()).min(2),
  output: z.string()
})

const ExtractAudioArgs = z.object({
  input: z.string(),
  output: z.string()
})

const ResizeArgs = z.object({
  input: z.string(),
  output: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional()
})

const CropArgs = z.object({
  input: z.string(),
  output: z.string(),
  left: z.number().int().nonnegative(),
  top: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
})

function wrapWs(
  fn: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ReturnType<typeof okResult>>
): RegisteredTool['execute'] {
  return async (raw, ctx) => {
    try {
      return await fn(raw, ctx)
    } catch (err) {
      if (err instanceof WorkspaceError) return errResult(err.message)
      return errResult(err instanceof Error ? err.message : String(err))
    }
  }
}

export const mediaTools: RegisteredTool[] = [
  {
    name: 'media_ffmpeg_trim',
    description: 'Trim a video/audio file with ffmpeg (workspace paths).',
    risk: 'risky',
    timeoutMs: 300_000,
    parameters: TrimArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        output: { type: 'string' },
        startSec: { type: 'number' },
        durationSec: { type: 'number' },
        endSec: { type: 'number' }
      },
      required: ['input', 'output']
    },
    preview: (a) => `ffmpeg trim ${String(a.input)} → ${String(a.output)}`,
    execute: wrapWs(async (raw, ctx) => {
      const args = TrimArgs.parse(raw)
      const input = resolveInWorkspace(ctx.workspacePath, args.input)
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      mkdirSync(dirname(output), { recursive: true })
      const ffArgs = ['-y', '-ss', String(args.startSec), '-i', input]
      if (args.durationSec != null) ffArgs.push('-t', String(args.durationSec))
      else if (args.endSec != null) ffArgs.push('-to', String(args.endSec))
      ffArgs.push('-c', 'copy', output)
      const log = await runFfmpeg(ffArgs, 300_000)
      return okResult(`Trimmed to ${output}\n${log}`)
    })
  },
  {
    name: 'media_ffmpeg_convert',
    description: 'Convert media with ffmpeg.',
    risk: 'risky',
    timeoutMs: 300_000,
    parameters: ConvertArgs,
    jsonSchema: {
      type: 'object',
      properties: { input: { type: 'string' }, output: { type: 'string' } },
      required: ['input', 'output']
    },
    preview: (a) => `ffmpeg convert ${String(a.input)} → ${String(a.output)}`,
    execute: wrapWs(async (raw, ctx) => {
      const args = ConvertArgs.parse(raw)
      const input = resolveInWorkspace(ctx.workspacePath, args.input)
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      mkdirSync(dirname(output), { recursive: true })
      const log = await runFfmpeg(['-y', '-i', input, output], 300_000)
      return okResult(`Converted to ${output}\n${log}`)
    })
  },
  {
    name: 'media_ffmpeg_subtitles',
    description: 'Burn or soft-mux subtitles from an SRT file onto video (uses ffmpeg subtitles filter).',
    risk: 'risky',
    timeoutMs: 600_000,
    parameters: SubtitleArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        output: { type: 'string' },
        srtPath: { type: 'string' }
      },
      required: ['input', 'output', 'srtPath']
    },
    preview: (a) => `Subtitles ${String(a.srtPath)} on ${String(a.input)}`,
    execute: wrapWs(async (raw, ctx) => {
      const args = SubtitleArgs.parse(raw)
      const input = resolveInWorkspace(ctx.workspacePath, args.input)
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      const srt = resolveInWorkspace(ctx.workspacePath, args.srtPath)
      mkdirSync(dirname(output), { recursive: true })
      const escaped = srt.replace(/\\/g, '/').replace(/:/g, '\\:')
      const log = await runFfmpeg(
        ['-y', '-i', input, '-vf', `subtitles='${escaped}'`, output],
        600_000
      )
      return okResult(`Wrote ${output}\n${log}`)
    })
  },
  {
    name: 'media_ffmpeg_concat',
    description: 'Concatenate media files with ffmpeg concat demuxer.',
    risk: 'risky',
    timeoutMs: 600_000,
    parameters: ConcatArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        inputs: { type: 'array', items: { type: 'string' } },
        output: { type: 'string' }
      },
      required: ['inputs', 'output']
    },
    preview: (a) => `Concat ${(a.inputs as string[] | undefined)?.length ?? 0} files`,
    execute: wrapWs(async (raw, ctx) => {
      const args = ConcatArgs.parse(raw)
      const { writeFileSync, unlinkSync } = await import('node:fs')
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      mkdirSync(dirname(output), { recursive: true })
      const listPath = join(dirname(output), `.concat-${Date.now()}.txt`)
      const lines = args.inputs.map((p) => {
        const full = resolveInWorkspace(ctx.workspacePath, p).replace(/\\/g, '/')
        return `file '${full.replace(/'/g, "'\\''")}'`
      })
      writeFileSync(listPath, lines.join('\n'), 'utf8')
      try {
        const log = await runFfmpeg(
          ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output],
          600_000
        )
        return okResult(`Concatenated to ${output}\n${log}`)
      } finally {
        try {
          unlinkSync(listPath)
        } catch {
          // ignore
        }
      }
    })
  },
  {
    name: 'media_ffmpeg_extract_audio',
    description: 'Extract audio track from a video with ffmpeg.',
    risk: 'risky',
    timeoutMs: 300_000,
    parameters: ExtractAudioArgs,
    jsonSchema: {
      type: 'object',
      properties: { input: { type: 'string' }, output: { type: 'string' } },
      required: ['input', 'output']
    },
    preview: (a) => `Extract audio ${String(a.input)} → ${String(a.output)}`,
    execute: wrapWs(async (raw, ctx) => {
      const args = ExtractAudioArgs.parse(raw)
      const input = resolveInWorkspace(ctx.workspacePath, args.input)
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      mkdirSync(dirname(output), { recursive: true })
      const log = await runFfmpeg(['-y', '-i', input, '-vn', '-acodec', 'copy', output], 300_000)
      return okResult(`Audio at ${output}\n${log}`)
    })
  },
  {
    name: 'media_sharp_resize',
    description: 'Resize an image with sharp (e.g. 1080x1080).',
    risk: 'risky',
    timeoutMs: 60_000,
    parameters: ResizeArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        output: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        fit: { type: 'string' }
      },
      required: ['input', 'output', 'width', 'height']
    },
    preview: (a) => `Resize ${String(a.input)} → ${a.width}x${a.height}`,
    execute: wrapWs(async (raw, ctx) => {
      const args = ResizeArgs.parse(raw)
      const sharp = (await import('sharp')).default
      const input = resolveInWorkspace(ctx.workspacePath, args.input)
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      mkdirSync(dirname(output), { recursive: true })
      await sharp(input)
        .resize(args.width, args.height, { fit: args.fit ?? 'cover' })
        .toFile(output)
      return okResult(`Resized to ${output}`)
    })
  },
  {
    name: 'media_sharp_crop',
    description: 'Crop an image with sharp.',
    risk: 'risky',
    timeoutMs: 60_000,
    parameters: CropArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        output: { type: 'string' },
        left: { type: 'number' },
        top: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' }
      },
      required: ['input', 'output', 'left', 'top', 'width', 'height']
    },
    preview: (a) => `Crop ${String(a.input)}`,
    execute: wrapWs(async (raw, ctx) => {
      const args = CropArgs.parse(raw)
      const sharp = (await import('sharp')).default
      const input = resolveInWorkspace(ctx.workspacePath, args.input)
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      mkdirSync(dirname(output), { recursive: true })
      await sharp(input)
        .extract({
          left: args.left,
          top: args.top,
          width: args.width,
          height: args.height
        })
        .toFile(output)
      return okResult(`Cropped to ${output}`)
    })
  },
  {
    name: 'media_sharp_convert',
    description: 'Convert image format with sharp (output extension selects format).',
    risk: 'risky',
    timeoutMs: 60_000,
    parameters: ConvertArgs,
    jsonSchema: {
      type: 'object',
      properties: { input: { type: 'string' }, output: { type: 'string' } },
      required: ['input', 'output']
    },
    preview: (a) => `Convert image ${String(a.input)} → ${String(a.output)}`,
    execute: wrapWs(async (raw, ctx) => {
      const args = ConvertArgs.parse(raw)
      const sharp = (await import('sharp')).default
      const input = resolveInWorkspace(ctx.workspacePath, args.input)
      const output = resolveInWorkspace(ctx.workspacePath, args.output)
      mkdirSync(dirname(output), { recursive: true })
      await sharp(input).toFile(output)
      return okResult(`Converted image to ${output}`)
    })
  }
]
