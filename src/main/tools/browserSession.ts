import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page
} from 'playwright'

/**
 * Persistent Chromium profile so logins survive across sessions.
 * Optional CDP: set LOCALPILOT_CDP_URL=http://127.0.0.1:9222 to attach to a real Chrome.
 */
class BrowserSession {
  private context: BrowserContext | null = null
  private cdpBrowser: Browser | null = null
  private page: Page | null = null

  profileDir(): string {
    try {
      const dir = join(app.getPath('userData'), 'browser-profile')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      return dir
    } catch {
      const dir = join(process.cwd(), '.localpilot-browser-profile')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      return dir
    }
  }

  async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page

    const cdp = process.env.LOCALPILOT_CDP_URL?.trim()
    if (cdp) {
      this.cdpBrowser = await chromium.connectOverCDP(cdp)
      const contexts = this.cdpBrowser.contexts()
      this.context = contexts[0] ?? (await this.cdpBrowser.newContext())
      const pages = this.context.pages()
      this.page = pages[0] ?? (await this.context.newPage())
      return this.page
    }

    this.context = await chromium.launchPersistentContext(this.profileDir(), {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    })
    const pages = this.context.pages()
    this.page = pages[0] ?? (await this.context.newPage())
    return this.page
  }

  async getPage(): Promise<Page> {
    return this.ensurePage()
  }

  async listPages(): Promise<Page[]> {
    await this.ensurePage()
    return this.context?.pages() ?? []
  }

  async newTab(url?: string): Promise<Page> {
    await this.ensurePage()
    if (!this.context) throw new Error('Browser context missing')
    const page = await this.context.newPage()
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    this.page = page
    return page
  }

  async setActivePage(index: number): Promise<Page> {
    const pages = await this.listPages()
    if (index < 0 || index >= pages.length) {
      throw new Error(`Tab index out of range: ${index} (have ${pages.length})`)
    }
    this.page = pages[index]
    await this.page.bringToFront()
    return this.page
  }

  async screenshotBase64(): Promise<string> {
    const page = await this.getPage()
    const buf = await page.screenshot({ type: 'png', fullPage: false })
    return buf.toString('base64')
  }

  async close(): Promise<void> {
    try {
      await this.context?.close()
    } catch {
      // ignore
    }
    try {
      await this.cdpBrowser?.close()
    } catch {
      // ignore
    }
    this.context = null
    this.cdpBrowser = null
    this.page = null
  }
}

export const browserSession = new BrowserSession()
