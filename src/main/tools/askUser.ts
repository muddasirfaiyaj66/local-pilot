import { z } from 'zod'
import { okResult, type RegisteredTool } from './types'

const AskArgs = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).optional()
})

/**
 * ask_user pauses the agent; the loop treats this specially and waits for IPC reply.
 * execute() is a placeholder — the agent loop intercepts this tool.
 */
export const askUserTool: RegisteredTool = {
  name: 'ask_user',
  description:
    'Pause and ask the human a clarifying question or for approval. Use when blocked or uncertain.',
  risk: 'safe',
  timeoutMs: 3_600_000,
  parameters: AskArgs,
  jsonSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: { type: 'array', items: { type: 'string' } }
    },
    required: ['question']
  },
  preview: (a) => `Ask user: ${String(a.question ?? '')}`,
  execute: async (raw) => {
    const args = AskArgs.parse(raw)
    return okResult(`Waiting for user: ${args.question}`)
  }
}
