import type { ToolDefinition } from '@shared/types'
import { askUserTool } from './askUser'
import { codeTools } from './code'
import { fsTools } from './fs'
import { shellTools } from './shell'
import { toToolDefinition, type RegisteredTool } from './types'

const ALL: RegisteredTool[] = [...fsTools, ...shellTools, ...codeTools, askUserTool]

export function getToolRegistry(): RegisteredTool[] {
  return ALL
}

export function getTool(name: string): RegisteredTool | undefined {
  return ALL.find((t) => t.name === name)
}

export function listToolDefinitions(): ToolDefinition[] {
  return ALL.map(toToolDefinition)
}

export type { RegisteredTool }
