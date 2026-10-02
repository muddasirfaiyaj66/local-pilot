import { existsSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'release',
  'dist',
  'build',
  '.cursor',
  'coverage',
  '.next',
  '.venv',
  'venv',
  '__pycache__'
])

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
  '.wasm',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.lock',
  '.sqlite',
  '.db'
])

interface IgnoreRule {
  negated: boolean
  dirOnly: boolean
  anchored: boolean
  regex: RegExp
}

export interface IgnoreMatcher {
  ignores(absPath: string, isDir: boolean): boolean
}

export function loadIgnoreMatcher(workspacePath: string): IgnoreMatcher {
  const rules = readGitignore(workspacePath)
  return {
    ignores(absPath: string, isDir: boolean): boolean {
      const rel = toPosix(relative(workspacePath, absPath))
      if (!rel || rel.startsWith('..')) return false
      const parts = rel.split('/')
      if (parts.some((part) => SKIP_DIRS.has(part))) return true
      if (!isDir && BINARY_EXT.has(extname(absPath).toLowerCase())) return true
      let ignored = false
      for (const rule of rules) {
        if (ruleMatches(rule, rel, isDir)) ignored = !rule.negated
      }
      return ignored
    }
  }
}

function readGitignore(workspacePath: string): IgnoreRule[] {
  const file = join(workspacePath, '.gitignore')
  if (!workspacePath || !existsSync(file)) return []
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const rules: IgnoreRule[] = []
  for (const raw of text.split(/\r?\n/)) {
    const rule = parseRule(raw)
    if (rule) rules.push(rule)
  }
  return rules
}

function parseRule(raw: string): IgnoreRule | null {
  let line = raw.trim()
  if (!line || line.startsWith('#')) return null
  let negated = false
  if (line.startsWith('!')) {
    negated = true
    line = line.slice(1).trim()
    if (!line) return null
  }
  let dirOnly = false
  if (line.endsWith('/')) {
    dirOnly = true
    line = line.slice(0, -1)
  }
  if (line.startsWith('/')) line = line.slice(1)
  if (!line) return null
  return {
    negated,
    dirOnly,
    anchored: line.includes('/'),
    regex: globToRegExp(line)
  }
}

function ruleMatches(rule: IgnoreRule, rel: string, isDir: boolean): boolean {
  const parts = rel.split('/')
  if (rule.anchored) {
    if (!rule.dirOnly && rule.regex.test(rel)) return true
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/')
      const prefixIsDir = i < parts.length || isDir
      if (rule.dirOnly && !prefixIsDir) continue
      if (rule.regex.test(prefix)) return true
    }
    return false
  }

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]!
    const segmentIsDir = i < parts.length - 1 || isDir
    if (rule.dirOnly && !segmentIsDir) continue
    if (rule.regex.test(segment)) return true
  }
  return false
}

function globToRegExp(pattern: string): RegExp {
  let src = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        src += '(?:.*/)?'
        i += 2
        continue
      }
      src += '.*'
      i += 1
      continue
    }
    if (c === '*') {
      src += '[^/]*'
      continue
    }
    if (c === '?') {
      src += '[^/]'
      continue
    }
    if ('\\^$+?.()|{}[]'.includes(c)) src += `\\${c}`
    else src += c
  }
  return new RegExp(`^${src}$`)
}

function toPosix(rel: string): string {
  return rel.split(sep).join('/')
}
