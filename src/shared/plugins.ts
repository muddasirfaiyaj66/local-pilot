import { z } from 'zod'

/**
 * LocalPilot plugins are declarative JSON manifests — they never run code in
 * the app. They contribute editor themes, snippets, AI prompt commands, and
 * MCP servers (which run as separate processes under the agent's normal
 * tool-approval rules).
 */

export const PluginThemeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  label: z.string().min(1).max(60),
  base: z.enum(['vs', 'vs-dark', 'hc-black', 'hc-light']),
  colors: z.record(z.string()).default({}),
  rules: z
    .array(
      z.object({
        token: z.string(),
        foreground: z.string().optional(),
        background: z.string().optional(),
        fontStyle: z.string().optional()
      })
    )
    .default([])
})
export type PluginTheme = z.infer<typeof PluginThemeSchema>

export const PluginSnippetSchema = z.object({
  /** Monaco language id, or "*" for every language. */
  language: z.string().min(1),
  prefix: z.string().min(1).max(40),
  /** Monaco snippet syntax: $1, ${2:placeholder}, $0. */
  body: z.string().min(1).max(4000),
  description: z.string().max(200).optional()
})
export type PluginSnippet = z.infer<typeof PluginSnippetSchema>

export const PluginCommandSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  title: z.string().min(1).max(60),
  /**
   * Prompt template. Placeholders: {{selection}}, {{file}}, {{language}}.
   * `inline` commands rewrite the selection in the editor (diff review);
   * `chat` commands send the prompt to the chat.
   */
  prompt: z.string().min(1).max(4000),
  target: z.enum(['chat', 'inline']).default('chat')
})
export type PluginCommand = z.infer<typeof PluginCommandSchema>

export const PluginMcpServerSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  command: z.string().min(1),
  /** `${workspace}` is replaced with the open folder when the plugin is enabled. */
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional()
})

export const PluginCategorySchema = z.enum(['theme', 'snippets', 'prompts', 'mcp', 'pack'])
export type PluginCategory = z.infer<typeof PluginCategorySchema>

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-.]{1,63}$/, 'id: lowercase letters, digits, dot, dash'),
  name: z.string().min(1).max(60),
  version: z.string().min(1).max(20).default('1.0.0'),
  description: z.string().max(300).default(''),
  author: z.string().max(60).optional(),
  category: PluginCategorySchema.default('pack'),
  contributes: z
    .object({
      themes: z.array(PluginThemeSchema).max(20).default([]),
      snippets: z.array(PluginSnippetSchema).max(500).default([]),
      commands: z.array(PluginCommandSchema).max(50).default([]),
      mcpServers: z.array(PluginMcpServerSchema).max(10).default([])
    })
    .default({})
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>
export type PluginManifestInput = z.input<typeof PluginManifestSchema>

export interface InstalledPlugin {
  manifest: PluginManifest
  enabled: boolean
  /** True when the manifest is also in the built-in catalog. */
  builtin: boolean
}

/** Fill a prompt template from the editor context. */
export function renderPluginPrompt(
  template: string,
  context: { selection: string; file: string; language: string }
): string {
  return template
    .replaceAll('{{selection}}', context.selection)
    .replaceAll('{{file}}', context.file)
    .replaceAll('{{language}}', context.language)
}

// ── Built-in marketplace ───────────────────────────────────────────

const theme = (
  id: string,
  label: string,
  base: PluginTheme['base'],
  colors: Record<string, string>,
  rules: PluginTheme['rules']
): PluginTheme => ({ id, label, base, colors, rules })

export const BUILTIN_PLUGINS: PluginManifestInput[] = [
  {
    id: 'lp.theme-midnight',
    name: 'Midnight Ink',
    version: '1.0.0',
    author: 'LocalPilot',
    category: 'theme',
    description: 'Deep blue-black editor theme with cool, low-glare syntax colors.',
    contributes: {
      themes: [
        theme(
          'midnight-ink',
          'Midnight Ink',
          'vs-dark',
          {
            'editor.background': '#0d1117',
            'editor.foreground': '#c9d1d9',
            'editorLineNumber.foreground': '#3b4252',
            'editorLineNumber.activeForeground': '#8b949e',
            'editor.selectionBackground': '#1f3a5f',
            'editor.lineHighlightBackground': '#131a24',
            'editorCursor.foreground': '#58a6ff'
          },
          [
            { token: 'comment', foreground: '6e7681', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'ff7b72' },
            { token: 'string', foreground: 'a5d6ff' },
            { token: 'number', foreground: '79c0ff' },
            { token: 'type', foreground: 'ffa657' },
            { token: 'identifier', foreground: 'c9d1d9' },
            { token: 'delimiter', foreground: '8b949e' }
          ]
        )
      ]
    }
  },
  {
    id: 'lp.theme-paper',
    name: 'Paper Light',
    version: '1.0.0',
    author: 'LocalPilot',
    category: 'theme',
    description: 'A calm light theme on warm off-white for daytime work.',
    contributes: {
      themes: [
        theme(
          'paper-light',
          'Paper Light',
          'vs',
          {
            'editor.background': '#fbf9f5',
            'editor.foreground': '#2b2a28',
            'editorLineNumber.foreground': '#c2bdb3',
            'editorLineNumber.activeForeground': '#6d685f',
            'editor.selectionBackground': '#f1dcc0',
            'editor.lineHighlightBackground': '#f3efe7'
          },
          [
            { token: 'comment', foreground: '9a948a', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'a8431b' },
            { token: 'string', foreground: '3d7a3a' },
            { token: 'number', foreground: '1f5fa8' },
            { token: 'type', foreground: '8a4fa8' }
          ]
        )
      ]
    }
  },
  {
    id: 'lp.theme-evergreen',
    name: 'Evergreen',
    version: '1.0.0',
    author: 'LocalPilot',
    category: 'theme',
    description: 'Muted forest greens and soft gold on charcoal.',
    contributes: {
      themes: [
        theme(
          'evergreen',
          'Evergreen',
          'vs-dark',
          {
            'editor.background': '#101512',
            'editor.foreground': '#d4dccf',
            'editorLineNumber.foreground': '#36443a',
            'editor.selectionBackground': '#24402f',
            'editor.lineHighlightBackground': '#151c17',
            'editorCursor.foreground': '#d9b45a'
          },
          [
            { token: 'comment', foreground: '6b7d6f', fontStyle: 'italic' },
            { token: 'keyword', foreground: '8fc78f' },
            { token: 'string', foreground: 'd9b45a' },
            { token: 'number', foreground: 'e39b6b' },
            { token: 'type', foreground: '7fb8c4' }
          ]
        )
      ]
    }
  },
  {
    id: 'lp.snippets-web',
    name: 'TypeScript & React Snippets',
    version: '1.0.0',
    author: 'LocalPilot',
    category: 'snippets',
    description: 'Components, hooks, effects, and test scaffolds for TS/TSX.',
    contributes: {
      snippets: [
        {
          language: 'typescript',
          prefix: 'rfc',
          description: 'React function component',
          body: "export function ${1:Component}(): React.JSX.Element {\n  return <div>$0</div>\n}"
        },
        {
          language: 'typescript',
          prefix: 'ust',
          description: 'useState hook',
          body: 'const [${1:value}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initial})'
        },
        {
          language: 'typescript',
          prefix: 'uef',
          description: 'useEffect hook',
          body: 'useEffect(() => {\n  $0\n  return () => {}\n}, [${1}])'
        },
        {
          language: 'typescript',
          prefix: 'desc',
          description: 'Vitest describe/it block',
          body: "describe('${1:subject}', () => {\n  it('${2:does something}', () => {\n    $0\n  })\n})"
        },
        {
          language: 'typescript',
          prefix: 'afn',
          description: 'Async arrow function',
          body: 'const ${1:name} = async (${2}): Promise<${3:void}> => {\n  $0\n}'
        },
        {
          language: 'javascript',
          prefix: 'clg',
          description: 'console.log',
          body: 'console.log(${1})'
        },
        {
          language: 'typescript',
          prefix: 'clg',
          description: 'console.log',
          body: 'console.log(${1})'
        }
      ]
    }
  },
  {
    id: 'lp.snippets-python',
    name: 'Python Snippets',
    version: '1.0.0',
    author: 'LocalPilot',
    category: 'snippets',
    description: 'Main guard, dataclasses, typed functions, and pytest tests.',
    contributes: {
      snippets: [
        {
          language: 'python',
          prefix: 'main',
          description: 'if __name__ == "__main__"',
          body: 'def main() -> None:\n    $0\n\n\nif __name__ == "__main__":\n    main()'
        },
        {
          language: 'python',
          prefix: 'dc',
          description: 'dataclass',
          body: 'from dataclasses import dataclass\n\n\n@dataclass\nclass ${1:Name}:\n    ${2:field}: ${3:str}'
        },
        {
          language: 'python',
          prefix: 'deft',
          description: 'typed function',
          body: 'def ${1:name}(${2:arg}: ${3:str}) -> ${4:None}:\n    """${5:Docstring.}"""\n    $0'
        },
        {
          language: 'python',
          prefix: 'test',
          description: 'pytest test',
          body: 'def test_${1:behavior}() -> None:\n    $0\n    assert ${2:True}'
        }
      ]
    }
  },
  {
    id: 'lp.prompts-review',
    name: 'Code Review Toolkit',
    version: '1.0.0',
    author: 'LocalPilot',
    category: 'prompts',
    description: 'Explain, find bugs, optimize, test, and document selected code.',
    contributes: {
      commands: [
        {
          id: 'explain',
          title: 'Explain this code',
          target: 'chat',
          prompt: 'Explain what this {{language}} code from `{{file}}` does, step by step, and point out anything surprising:\n\n```{{language}}\n{{selection}}\n```'
        },
        {
          id: 'find-bugs',
          title: 'Find bugs',
          target: 'chat',
          prompt: 'Review this {{language}} code from `{{file}}` for bugs. For each one give the line, the input that triggers it, and a fix:\n\n```{{language}}\n{{selection}}\n```'
        },
        {
          id: 'optimize',
          title: 'Optimize performance',
          target: 'inline',
          prompt: 'Rewrite this code to be faster and allocate less without changing behavior.'
        },
        {
          id: 'readable',
          title: 'Refactor for readability',
          target: 'inline',
          prompt: 'Refactor this code for readability: clearer names, smaller functions, no behavior change.'
        },
        {
          id: 'docs',
          title: 'Add doc comments',
          target: 'inline',
          prompt: 'Add concise doc comments in the idiomatic style for this language. Do not change the code.'
        },
        {
          id: 'tests',
          title: 'Write unit tests',
          target: 'chat',
          prompt: 'Write thorough unit tests for this {{language}} code from `{{file}}`, covering edge cases. Use the test framework the project already uses:\n\n```{{language}}\n{{selection}}\n```'
        }
      ]
    }
  },
  {
    id: 'lp.prompts-security',
    name: 'Security Auditor',
    version: '1.0.0',
    author: 'LocalPilot',
    category: 'prompts',
    description: 'Audit code for injection, auth, secrets, and unsafe input handling.',
    contributes: {
      commands: [
        {
          id: 'audit',
          title: 'Security audit selection',
          target: 'chat',
          prompt: 'Audit this {{language}} code from `{{file}}` for security issues (injection, path traversal, authz gaps, secrets, unsafe deserialization). Rank findings by severity with a concrete exploit scenario and fix:\n\n```{{language}}\n{{selection}}\n```'
        },
        {
          id: 'harden',
          title: 'Harden input validation',
          target: 'inline',
          prompt: 'Add strict input validation and safe error handling to this code. Keep the public interface the same.'
        }
      ]
    }
  },
  {
    id: 'lp.mcp-fetch',
    name: 'Web Fetch (MCP)',
    version: '1.0.0',
    author: 'Model Context Protocol',
    category: 'mcp',
    description: 'Lets the agent fetch web pages as Markdown. Requires uv (uvx).',
    contributes: {
      mcpServers: [{ name: 'fetch', command: 'uvx', args: ['mcp-server-fetch'] }]
    }
  },
  {
    id: 'lp.mcp-memory',
    name: 'Knowledge Graph Memory (MCP)',
    version: '1.0.0',
    author: 'Model Context Protocol',
    category: 'mcp',
    description: 'Persistent entity/relation memory the agent can read and write. Requires Node.',
    contributes: {
      mcpServers: [{ name: 'memory', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }]
    }
  },
  {
    id: 'lp.mcp-thinking',
    name: 'Sequential Thinking (MCP)',
    version: '1.0.0',
    author: 'Model Context Protocol',
    category: 'mcp',
    description: 'A structured step-by-step reasoning tool for hard problems. Requires Node.',
    contributes: {
      mcpServers: [
        { name: 'thinking', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] }
      ]
    }
  },
  {
    id: 'lp.mcp-git',
    name: 'Git (MCP)',
    version: '1.0.0',
    author: 'Model Context Protocol',
    category: 'mcp',
    description: 'Git log, diff, blame, and branch tools for the open folder. Requires uv (uvx).',
    contributes: {
      mcpServers: [{ name: 'git', command: 'uvx', args: ['mcp-server-git', '--repository', '${workspace}'] }]
    }
  },
  {
    id: 'lp.mcp-playwright',
    name: 'Playwright Browser (MCP)',
    version: '1.0.0',
    author: 'Microsoft',
    category: 'mcp',
    description: 'Accessibility-tree browser automation for the agent. Requires Node.',
    contributes: {
      mcpServers: [{ name: 'playwright', command: 'npx', args: ['-y', '@playwright/mcp@latest'] }]
    }
  }
]

export const PLUGIN_TEMPLATE: PluginManifestInput = {
  id: 'my.plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'What this plugin adds.',
  category: 'pack',
  contributes: {
    commands: [
      {
        id: 'summarize',
        title: 'Summarize selection',
        target: 'chat',
        prompt: 'Summarize this {{language}} code from {{file}}:\n\n{{selection}}'
      }
    ],
    snippets: [{ language: 'typescript', prefix: 'todo', body: '// TODO(${1:me}): $0' }],
    themes: [],
    mcpServers: []
  }
}
