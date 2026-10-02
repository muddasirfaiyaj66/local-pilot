export interface TextHunk {
  beforeStart: number
  beforeLines: string[]
  afterStart: number
  afterLines: string[]
}

function linesOf(text: string): string[] {
  if (text === '') return []
  return text.split('\n')
}

function joinLines(lines: string[]): string {
  return lines.join('\n')
}

interface Edit {
  type: 'eq' | 'del' | 'add'
  line: string
}

/** Line hunks for review. Large files fall back to one changed middle hunk. */
export function diffHunks(before: string, after: string): TextHunk[] {
  const a = linesOf(before)
  const b = linesOf(after)
  if (a.length > 400 || b.length > 400) return coarseHunk(a, b)
  return groupEdits(a, b, edits(a, b))
}

export function undoHunk(after: string, hunk: TextHunk): string {
  const lines = linesOf(after)
  lines.splice(hunk.afterStart, hunk.afterLines.length, ...hunk.beforeLines)
  return joinLines(lines)
}

export function keepHunk(before: string, hunk: TextHunk): string {
  const lines = linesOf(before)
  lines.splice(hunk.beforeStart, hunk.beforeLines.length, ...hunk.afterLines)
  return joinLines(lines)
}

function coarseHunk(a: string[], b: string[]): TextHunk[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let aEnd = a.length
  let bEnd = b.length
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd -= 1
    bEnd -= 1
  }
  if (start === aEnd && start === bEnd) return []
  return [
    {
      beforeStart: start,
      beforeLines: a.slice(start, aEnd),
      afterStart: start,
      afterLines: b.slice(start, bEnd)
    }
  ]
}

function edits(a: string[], b: string[]): Edit[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: Edit[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'eq', line: a[i]! })
      i += 1
      j += 1
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: 'del', line: a[i]! })
      i += 1
    } else {
      out.push({ type: 'add', line: b[j]! })
      j += 1
    }
  }
  while (i < n) out.push({ type: 'del', line: a[i++]! })
  while (j < m) out.push({ type: 'add', line: b[j++]! })
  return out
}

function groupEdits(a: string[], b: string[], list: Edit[]): TextHunk[] {
  const hunks: TextHunk[] = []
  let ai = 0
  let bi = 0
  let index = 0
  while (index < list.length) {
    if (list[index]!.type === 'eq') {
      ai += 1
      bi += 1
      index += 1
      continue
    }
    const beforeStart = ai
    const afterStart = bi
    const beforeLines: string[] = []
    const afterLines: string[] = []
    while (index < list.length && list[index]!.type !== 'eq') {
      const edit = list[index]!
      if (edit.type === 'del') {
        beforeLines.push(edit.line)
        ai += 1
      } else {
        afterLines.push(edit.line)
        bi += 1
      }
      index += 1
    }
    hunks.push({ beforeStart, beforeLines, afterStart, afterLines })
    void a
    void b
  }
  return hunks
}
