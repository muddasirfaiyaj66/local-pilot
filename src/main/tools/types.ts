import { z } from 'zod'
import type { RiskLevel, ToolResult } from '@shared/agent'
import type { ToolDefinition } from '@shared/types'

export interface ToolContext {
  workspacePath: string
  signal?: AbortSignal
  /** Absolute paths must stay under workspace unless explicitly allowed */
  allowOutsideWorkspace: boolean
}

export interface RegisteredTool {
  name: string
  description: string
  risk: RiskLevel
  timeoutMs: number
  parameters: z.ZodType
  /** JSON Schema object for LLM tool calling */
  jsonSchema: Record<string, unknown>
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
  /** Build human-readable preview for permission UI */
  preview: (args: Record<string, unknown>) => string
}

export function toToolDefinition(tool: RegisteredTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.jsonSchema
  }
}

export function okResult(output: string, meta?: Record<string, unknown>): ToolResult {
  return { ok: true, output, meta }
}

export function errResult(error: string, output = ''): ToolResult {
  return { ok: false, output, error }
}
