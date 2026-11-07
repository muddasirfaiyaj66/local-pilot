/** Monaco-free helpers (unit-testable under Node). */

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json', md: 'markdown', mdx: 'markdown',
  css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell', psm1: 'powershell', bat: 'bat', cmd: 'bat',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', env: 'ini', xml: 'xml', svg: 'xml',
  sql: 'sql', graphql: 'graphql', gql: 'graphql', dockerfile: 'dockerfile', lua: 'lua', r: 'r',
  dart: 'dart', scala: 'scala', ex: 'elixir', exs: 'elixir', sol: 'sol', tf: 'hcl'
}

export function languageForPath(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return EXTENSION_LANGUAGE[ext] ?? 'plaintext'
}

/** Pull the code out of a model reply: the first fenced block, else the whole text. */
export function extractCode(reply: string): string {
  const fence = /```[\w.+-]*[ \t]*\r?\n([\s\S]*?)```/.exec(reply)
  if (fence) return fence[1]!.replace(/\r?\n$/, '')
  // Unterminated fence while streaming.
  const open = /```[\w.+-]*[ \t]*\r?\n([\s\S]*)$/.exec(reply)
  if (open) return open[1]!
  return reply.trim()
}

