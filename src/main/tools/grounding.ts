/** Parse grounding coords like `click(120, 40)` or JSON `{x,y}` from vision models */
export function parseGroundingCoordinates(text: string): { x: number; y: number } | null {
  const json = text.match(
    /\{\s*"?x"?\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"?y"?\s*:\s*(\d+(?:\.\d+)?)\s*\}/i
  )
  if (json) return { x: Number(json[1]), y: Number(json[2]) }
  const pair = text.match(
    /(?:click|point|coord(?:inate)?s?)\s*\(?\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)?/i
  )
  if (pair) return { x: Number(pair[1]), y: Number(pair[2]) }
  return null
}
