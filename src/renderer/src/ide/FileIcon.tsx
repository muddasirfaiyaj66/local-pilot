import {
  File,
  FileCode,
  FileCss,
  FileHtml,
  FileImage,
  FileJs,
  FileMd,
  FilePy,
  FileText,
  FileTs,
  FileTsx,
  FileJsx,
  FileLock,
  GearSix,
  BracketsCurly,
  Terminal
} from '@phosphor-icons/react'

const COLOR: Record<string, string> = {
  ts: '#5b9bd5', tsx: '#5b9bd5', js: '#e3c07a', jsx: '#e3c07a', mjs: '#e3c07a', cjs: '#e3c07a',
  json: '#d7a2f0', md: '#9aa1ab', css: '#72b7e8', scss: '#e07aa6', html: '#f07178',
  py: '#7fb8c4', rs: '#e39b6b', go: '#72d0e8', sh: '#9ccf8a', ps1: '#72b7e8',
  png: '#9ccf8a', jpg: '#9ccf8a', jpeg: '#9ccf8a', gif: '#9ccf8a', svg: '#e3c07a', webp: '#9ccf8a'
}

/** Small file-type glyph, colored by language like an editor explorer. */
export function FileIcon({ name, size = 14 }: { name: string; size?: number }): React.JSX.Element {
  const lower = name.toLowerCase()
  const ext = lower.includes('.') ? lower.split('.').pop()! : ''
  const color = COLOR[ext] ?? 'var(--color-text-faint)'
  const props = { size, className: 'shrink-0', style: { color }, 'aria-hidden': true as const }
  if (lower === 'package.json' || lower.startsWith('tsconfig') || lower.startsWith('.env') || lower.endsWith('rc'))
    return <GearSix {...props} />
  if (lower.endsWith('.lock') || lower === 'pnpm-lock.yaml' || lower === 'package-lock.json') return <FileLock {...props} />
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return <FileTs {...props} />
    case 'tsx':
      return <FileTsx {...props} />
    case 'js':
    case 'mjs':
    case 'cjs':
      return <FileJs {...props} />
    case 'jsx':
      return <FileJsx {...props} />
    case 'css':
    case 'scss':
    case 'less':
      return <FileCss {...props} />
    case 'html':
    case 'htm':
      return <FileHtml {...props} />
    case 'md':
    case 'mdx':
      return <FileMd {...props} />
    case 'py':
      return <FilePy {...props} />
    case 'json':
    case 'jsonc':
      return <BracketsCurly {...props} />
    case 'sh':
    case 'bash':
    case 'ps1':
    case 'bat':
    case 'cmd':
      return <Terminal {...props} />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'ico':
      return <FileImage {...props} />
    case 'txt':
    case 'log':
      return <FileText {...props} />
    case '':
      return <File {...props} />
    default:
      return <FileCode {...props} />
  }
}
