import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mediaTools } from './media'

describe('media tools', () => {
  let dir: string

  afterEach(() => {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  it('registers expected media tool names', () => {
    const names = mediaTools.map((t) => t.name).sort()
    expect(names).toContain('media_sharp_resize')
    expect(names).toContain('media_ffmpeg_trim')
    expect(names).toContain('media_ffmpeg_extract_audio')
  })

  it('media_sharp_resize works with sharp when available', async () => {
    const tool = mediaTools.find((t) => t.name === 'media_sharp_resize')
    expect(tool).toBeDefined()
    dir = mkdtempSync(join(tmpdir(), 'lp-media-'))
    // 1x1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    const input = join(dir, 'in.png')
    writeFileSync(input, png)
    const result = await tool!.execute(
      { input: 'in.png', output: 'out.png', width: 8, height: 8 },
      { workspacePath: dir, allowOutsideWorkspace: false }
    )
    if (!result.ok && /sharp|Cannot find module/i.test(result.error ?? '')) {
      // optional native dep in some CI images
      return
    }
    expect(result.ok).toBe(true)
  })
})
