/** Approximate context window for the meter and transcript trimming. */
export function contextLimitForModel(model: string): number {
  const m = model.toLowerCase()
  if (m.includes('claude') || m.includes('gemini')) return 200_000
  if (
    m.includes('gpt-4.1') ||
    m.includes('gpt-4o') ||
    m.includes('gpt-5') ||
    m.includes('o1') ||
    m.includes('o3') ||
    m.includes('o4')
  ) {
    return 128_000
  }
  if (m.includes('gemma') || m.includes('kimi') || m.includes('qwen')) return 128_000
  if (/llama3\.(1|2|3)/.test(m) || m.includes('llama-3.1') || m.includes('llama-3.2') || m.includes('llama-3.3')) {
    return 128_000
  }
  if (m.includes('llama')) return 8_192
  if (m.includes('mistral') || m.includes('mixtral')) return 32_768
  return 32_768
}
