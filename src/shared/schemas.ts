import { z } from 'zod'

/** Permission modes — full enforcement lands in Phase 2 */
export const PermissionModeSchema = z.enum(['ask-every-time', 'ask-risky', 'autonomous'])
export type PermissionMode = z.infer<typeof PermissionModeSchema>

export const ProviderKindSchema = z.enum(['ollama', 'openai-compat', 'anthropic', 'gemini'])
export type ProviderKind = z.infer<typeof ProviderKindSchema>

export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  kind: ProviderKindSchema,
  name: z.string().min(1),
  baseUrl: z.string().url().or(z.string().startsWith('http')),
  model: z.string().min(1),
  /** API key is stored encrypted; this flag only indicates presence */
  hasApiKey: z.boolean().default(false),
  visionEnabled: z.boolean().default(false),
  enabled: z.boolean().default(true)
})
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

export const ChatRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])
export type ChatRole = z.infer<typeof ChatRoleSchema>

export const ChatImageSchema = z.object({
  mimeType: z.string(),
  /** base64 without data-URI prefix */
  data: z.string()
})
export type ChatImage = z.infer<typeof ChatImageSchema>

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: ChatRoleSchema,
  content: z.string(),
  images: z.array(ChatImageSchema).optional(),
  toolCallId: z.string().optional(),
  createdAt: z.number()
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown())
})
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown())
})
export type ToolCall = z.infer<typeof ToolCallSchema>

/** Streaming chunks from any provider */
export const ChatStreamChunkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool_call'), toolCall: ToolCallSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('done'), finishReason: z.string().optional() })
])
export type ChatStreamChunk = z.infer<typeof ChatStreamChunkSchema>

export const ChatRequestSchema = z.object({
  providerId: z.string(),
  messages: z.array(
    z.object({
      role: ChatRoleSchema,
      content: z.string(),
      images: z.array(ChatImageSchema).optional()
    })
  ),
  tools: z.array(ToolDefinitionSchema).optional(),
  stream: z.boolean().default(true)
})
export type ChatRequest = z.infer<typeof ChatRequestSchema>

export const AppSettingsSchema = z.object({
  workspacePath: z.string().default(''),
  permissionMode: PermissionModeSchema.default('ask-risky'),
  activeProviderId: z.string().nullable().default(null),
  providers: z.array(ProviderConfigSchema).default([])
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const TestConnectionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  models: z.array(z.string()).optional(),
  latencyMs: z.number().optional()
})
export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>
