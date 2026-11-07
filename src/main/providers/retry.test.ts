import { afterEach, describe, expect, it, vi } from 'vitest'
import { delay, fetchWithRetry, isRetryableStatus, retryAfterMs, withRetry } from './retry'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isRetryableStatus', () => {
  it('treats rate limits and 5xx as retryable', () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
  })

  it('does not retry ordinary client errors', () => {
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
  })
})

describe('retryAfterMs', () => {
  it('parses seconds', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '2' }))).toBe(2000)
  })

  it('parses an HTTP date', () => {
    const future = new Date(Date.now() + 1500).toUTCString()
    const ms = retryAfterMs(new Headers({ 'retry-after': future }))
    expect(ms).toBeGreaterThan(500)
    expect(ms).toBeLessThanOrEqual(2000)
  })

  it('returns undefined when absent', () => {
    expect(retryAfterMs(new Headers())).toBeUndefined()
    expect(retryAfterMs(undefined)).toBeUndefined()
  })
})

describe('fetchWithRetry', () => {
  it('retries a retryable status then returns the success', async () => {
    const calls: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls.push(1)
        if (calls.length < 3) {
          return new Response('nope', { status: 429, headers: { 'retry-after': '0' } })
        }
        return new Response('ok', { status: 200 })
      })
    )

    const res = await fetchWithRetry('http://x', {}, { baseDelayMs: 1 })
    expect(res.status).toBe(200)
    expect(calls.length).toBe(3)
  })

  it('does not retry a non-retryable status', async () => {
    const fetchMock = vi.fn(async () => new Response('bad', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await fetchWithRetry('http://x', {}, { baseDelayMs: 1 })
    expect(res.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a network error', async () => {
    let attempts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempts += 1
        if (attempts === 1) throw new TypeError('fetch failed')
        return new Response('ok', { status: 200 })
      })
    )

    const res = await fetchWithRetry('http://x', {}, { baseDelayMs: 1 })
    expect(res.status).toBe(200)
    expect(attempts).toBe(2)
  })
})

describe('withRetry', () => {
  it('retries until success', async () => {
    let n = 0
    const result = await withRetry(
      async () => {
        n += 1
        if (n < 3) throw new Error('transient')
        return 'done'
      },
      { baseDelayMs: 1 }
    )
    expect(result).toBe('done')
    expect(n).toBe(3)
  })

  it('stops when shouldRetry says no', async () => {
    let n = 0
    await expect(
      withRetry(
        async () => {
          n += 1
          throw new Error('permanent')
        },
        { baseDelayMs: 1, shouldRetry: () => false }
      )
    ).rejects.toThrow('permanent')
    expect(n).toBe(1)
  })

  it('reports retries via onRetry', async () => {
    const onRetry = vi.fn()
    let n = 0
    await withRetry(
      async () => {
        n += 1
        if (n < 2) throw new Error('transient')
        return 1
      },
      { baseDelayMs: 1, onRetry }
    )
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('delay', () => {
  it('rejects immediately when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(delay(1000, controller.signal)).rejects.toThrow(/abort/i)
  })
})
