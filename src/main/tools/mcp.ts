import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { errResult, okResult, type RegisteredTool } from './types'

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional()
})

const McpConfigSchema = z.object({
  servers: z.array(McpServerConfigSchema).default([])
})

type Connected = {
  name: string
  client: Client
  tools: RegisteredTool[]
}

const connections: Connected[] = []

function mcpConfigPath(): string {
  try {
    return join(app.getPath('userData'), 'mcp.json')
  } catch {
    return join(process.cwd(), 'mcp.json')
  }
}

export function readMcpConfig(): z.infer<typeof McpConfigSchema> {
  const path = mcpConfigPath()
  if (!existsSync(path)) return { servers: [] }
  try {
    return McpConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { servers: [] }
  }
}

/** Connect configured MCP servers and return dynamic tools (name prefixed mcp__server__tool). */
export async function loadMcpTools(): Promise<RegisteredTool[]> {
  await closeMcpConnections()
  const config = readMcpConfig()
  const tools: RegisteredTool[] = []

  for (const server of config.servers) {
    try {
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: { ...process.env, ...server.env } as Record<string, string>
      })
      const client = new Client({ name: 'localpilot', version: '0.5.0' })
      await client.connect(transport)
      const listed = await client.listTools()
      const serverTools: RegisteredTool[] = (listed.tools ?? []).map((t) => {
        const name = `mcp__${server.name}__${t.name}`
        return {
          name,
          description: `[MCP:${server.name}] ${t.description ?? t.name}`,
          risk: 'risky' as const,
          timeoutMs: 120_000,
          parameters: z.record(z.unknown()),
          jsonSchema: (t.inputSchema as Record<string, unknown>) ?? {
            type: 'object',
            properties: {}
          },
          preview: (args) => `MCP ${server.name}.${t.name}\n${JSON.stringify(args).slice(0, 400)}`,
          execute: async (args) => {
            try {
              const result = await client.callTool({ name: t.name, arguments: args })
              const text = JSON.stringify(result).slice(0, 50_000)
              return okResult(text)
            } catch (err) {
              return errResult(err instanceof Error ? err.message : String(err))
            }
          }
        }
      })
      connections.push({ name: server.name, client, tools: serverTools })
      tools.push(...serverTools)
    } catch (err) {
      console.warn(`[LocalPilot] MCP server failed: ${server.name}`, err)
    }
  }

  return tools
}

export async function closeMcpConnections(): Promise<void> {
  for (const c of connections) {
    try {
      await c.client.close()
    } catch {
      // ignore
    }
  }
  connections.length = 0
}

export const mcpMetaTools: RegisteredTool[] = [
  {
    name: 'mcp_reload',
    description: 'Reload MCP servers from userData/mcp.json and refresh dynamic tools.',
    risk: 'safe',
    timeoutMs: 60_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'Reload MCP servers',
    execute: async () => {
      const tools = await loadMcpTools()
      const { refreshDynamicTools } = await import('./registry')
      refreshDynamicTools(tools)
      return okResult(`Loaded ${tools.length} MCP tool(s) from ${mcpConfigPath()}`)
    }
  }
]
