import { describe, expect, it } from 'vitest'
import { browserTools } from './browser'

describe('browser tools', () => {
  it('registers required browser tool names', () => {
    const names = browserTools.map((t) => t.name)
    expect(names).toContain('browser_open_url')
    expect(names).toContain('browser_click')
    expect(names).toContain('browser_type')
    expect(names).toContain('browser_get_dom_snapshot')
    expect(names).toContain('browser_publish_text')
    expect(names).toContain('browser_tabs_list')
  })

  it('marks publish as critical with text preview', () => {
    const publish = browserTools.find((t) => t.name === 'browser_publish_text')
    expect(publish?.risk).toBe('critical')
    const preview = publish?.preview({ text: 'Hello Facebook' }) ?? ''
    expect(preview).toContain('Hello Facebook')
    expect(preview).toContain('PUBLISH')
  })
})
