import type { ToolDefinition } from '@shared/types'
import { askUserTool } from './askUser'
import { browserTools } from './browser'
import { codeTools } from './code'
import { fsTools } from './fs'
import { mcpMetaTools } from './mcp'
import { mediaTools } from './media'
import { memoryTools } from './memoryTools'
import { screenTools } from './screen'
import { shellTools } from './shell'
import { toToolDefinition, type RegisteredTool } from './types'

let dynamicTools: RegisteredTool[] = []

const STATIC: RegisteredTool[] = [
  ...fsTools,
  ...shellTools,
  ...codeTools,
  ...browserTools,
  ...screenTools,
  ...mediaTools,
  ...memoryTools,
  ...mcpMetaTools,
  askUserTool
]

export function refreshDynamicTools(tools: RegisteredTool[]): void {
  dynamicTools = tools
}

export function getToolRegistry(): RegisteredTool[] {
  return [...STATIC, ...dynamicTools]
}

export function getTool(name: string): RegisteredTool | undefined {
  return getToolRegistry().find((t) => t.name === name)
}

export function listToolDefinitions(): ToolDefinition[] {
  return getToolRegistry().map(toToolDefinition)
}

export type { RegisteredTool }
