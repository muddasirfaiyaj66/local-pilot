/** Shared retry/backoff helpers for provider HTTP calls. */

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  signal?: AbortSignal
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 8_000
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status)
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))
}

/** Parse a `Retry-After` header (seconds or HTTP date) into milliseconds. */
export function retryAfterMs(headers?: Headers | Record<string, string>): number | undefined {
  if (!headers) return undefined
  const raw = readHeader(headers, 'retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return undefined
}

function readHeader(headers: Headers | Record<string, string>, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }
  const record = headers as Record<string, string>
  const key = Object.keys(record).find((k) => k.toLowerCase() === name)
  return key ? record[key] : undefined
}

function backoffMs(attempt: number, opts: RetryOptions): number {
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const max = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const exp = base * 2 ** (attempt - 1)
  const jittered = exp * (0.7 + Math.random() * 0.6)
  return Math.min(max, Math.round(jittered))
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return sleep(ms, signal)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Retry an async operation with jittered exponential backoff.
 * `shouldRetry` decides whether a thrown error is worth another attempt.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions & { shouldRetry?: (err: unknown, attempt: number) => boolean } = {}
): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS
  const shouldRetry = opts.shouldRetry ?? (() => true)
  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err
      if (isAbortError(err) || attempt >= attempts || !shouldRetry(err, attempt)) throw err
      const delayMs = backoffMs(attempt, opts)
      opts.onRetry?.({ attempt, delayMs, reason: err instanceof Error ? err.message : String(err) })
      await sleep(delayMs, opts.signal)
    }
  }
  throw lastErr
}

/**
 * fetch() that retries transient network failures and retryable HTTP statuses
 * (429/5xx), honoring `Retry-After`. Only safe to wrap the initial request —
 * once a response body stream has started, retrying would duplicate output.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(input, init)
      if (response.ok || !isRetryableStatus(response.status) || attempt >= attempts) {
        return response
      }
      // Drain the retryable body so the connection can be reused.
      await response.text().catch(() => '')
      const delayMs = retryAfterMs(response.headers) ?? backoffMs(attempt, opts)
      opts.onRetry?.({
        attempt,
        delayMs,
        reason: `HTTP ${response.status}`
      })
      await sleep(delayMs, opts.signal)
    } catch (err) {
      if (isAbortError(err) || attempt >= attempts) throw err
      const delayMs = backoffMs(attempt, opts)
      opts.onRetry?.({
        attempt,
        delayMs,
        reason: err instanceof Error ? err.message : String(err)
      })
      await sleep(delayMs, opts.signal)
    }
  }
  throw new Error('fetchWithRetry exhausted attempts')
}
