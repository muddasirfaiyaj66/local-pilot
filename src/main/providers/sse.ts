/**
 * Shared Server-Sent Events reader.
 * Yields each `data:` payload (comments and blank lines skipped). Multi-line
 * `data:` fields are joined per the SSE spec.
 */
export async function* readSseLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []

  const flush = (): string | null => {
    if (dataLines.length === 0) return null
    const payload = dataLines.join('\n')
    dataLines = []
    return payload
  }

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const raw of parts) {
        const line = raw.trimEnd()
        if (line === '') {
          const payload = flush()
          if (payload !== null) yield payload
          continue
        }
        if (line.startsWith(':')) continue
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
      }
    }
    const tail = buffer.trimEnd()
    if (tail.startsWith('data:')) {
      dataLines.push(tail.slice(5).trimStart())
    }
    const payload = flush()
    if (payload !== null) yield payload
  } finally {
    reader.releaseLock()
  }
}
