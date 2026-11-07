import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { PluginManifest } from '@shared/plugins'

/**
 * Monaco is bundled (no CDN — the CSP only allows 'self'), with its language
 * workers built by Vite.
 */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}

loader.config({ monaco })

// The workspace isn't a TS project Monaco can resolve, so module-resolution
// errors would be noise. Keep syntax checks, drop semantic ones.
for (const defaults of [
  monaco.languages.typescript.typescriptDefaults,
  monaco.languages.typescript.javascriptDefaults
]) {
  defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
  defaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    allowJs: true
  })
}

/** The default theme, matched to the app's cool near-black + brand-blue tokens. */
monaco.editor.defineTheme('localpilot-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7380', fontStyle: 'italic' },
    { token: 'keyword', foreground: '5ea8ff' },
    { token: 'string', foreground: '9ccf8a' },
    { token: 'number', foreground: 'd7a2f0' },
    { token: 'type', foreground: '4fd1c5' },
    { token: 'type.identifier', foreground: '4fd1c5' },
    { token: 'delimiter', foreground: '9aa1ab' },
    { token: 'tag', foreground: '5ea8ff' },
    { token: 'attribute.name', foreground: '9cdcfe' }
  ],
  colors: {
    'editor.background': '#0b0c0e',
    'editor.foreground': '#e6e8eb',
    'editorLineNumber.foreground': '#434955',
    'editorLineNumber.activeForeground': '#9aa1ab',
    'editor.lineHighlightBackground': '#13151a',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#2f8df540',
    'editor.inactiveSelectionBackground': '#2f8df524',
    'editorCursor.foreground': '#2f8df5',
    'editorIndentGuide.background1': '#1c1f24',
    'editorIndentGuide.activeBackground1': '#343943',
    'editorWidget.background': '#16181c',
    'editorWidget.border': '#343943',
    'editorSuggestWidget.background': '#16181c',
    'editorSuggestWidget.selectedBackground': '#262a31',
    'minimap.background': '#0b0c0e',
    'scrollbarSlider.background': '#34394380',
    'diffEditor.insertedTextBackground': '#46b17b26',
    'diffEditor.removedTextBackground': '#e5484d26'
  }
})

export const BUILTIN_THEMES: Array<{ id: string; label: string }> = [
  { id: 'localpilot-dark', label: 'LocalPilot Dark' },
  { id: 'vs-dark', label: 'Dark (classic)' },
  { id: 'vs', label: 'Light (classic)' },
  { id: 'hc-black', label: 'High Contrast' }
]

/**
 * Register enabled plugins' themes and snippets. Returns a disposer so a
 * plugin change can re-register cleanly.
 */
export function registerPluginContributions(manifests: PluginManifest[]): () => void {
  const disposables: monaco.IDisposable[] = []
  for (const manifest of manifests) {
    for (const theme of manifest.contributes.themes) {
      monaco.editor.defineTheme(theme.id, {
        base: theme.base,
        inherit: true,
        rules: theme.rules,
        colors: theme.colors
      })
    }
  }

  const byLanguage = new Map<string, Array<{ prefix: string; body: string; description?: string }>>()
  for (const manifest of manifests) {
    for (const snippet of manifest.contributes.snippets) {
      const list = byLanguage.get(snippet.language) ?? []
      list.push(snippet)
      byLanguage.set(snippet.language, list)
    }
  }
  const languages = monaco.languages.getLanguages().map((l) => l.id)
  for (const [language, snippets] of byLanguage) {
    const targets = language === '*' ? languages : [language]
    for (const target of targets) {
      disposables.push(
        monaco.languages.registerCompletionItemProvider(target, {
          provideCompletionItems(model, position) {
            const word = model.getWordUntilPosition(position)
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
            return {
              suggestions: snippets.map((snippet) => ({
                label: snippet.prefix,
                kind: monaco.languages.CompletionItemKind.Snippet,
                documentation: snippet.description,
                detail: snippet.description ?? 'Plugin snippet',
                insertText: snippet.body,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range
              }))
            }
          }
        })
      )
    }
  }
  return () => {
    for (const d of disposables) d.dispose()
  }
}

export { languageForPath, extractCode } from './codeUtils'
export { monaco }
