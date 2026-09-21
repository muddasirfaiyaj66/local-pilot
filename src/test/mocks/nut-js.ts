/** Stub for @nut-tree-fork/nut-js in unit tests. */
export const Button = { LEFT: 0, RIGHT: 1, MIDDLE: 2 }
export const Key = new Proxy(
  {},
  {
    get: (_t, prop) => String(prop)
  }
)

export const mouse = {
  config: { autoDelayMs: 0 },
  setPosition: async (): Promise<void> => undefined,
  move: async (): Promise<void> => undefined,
  click: async (): Promise<void> => undefined,
  doubleClick: async (): Promise<void> => undefined,
  pressButton: async (): Promise<void> => undefined,
  releaseButton: async (): Promise<void> => undefined,
  scrollDown: async (): Promise<void> => undefined,
  scrollUp: async (): Promise<void> => undefined,
  drag: async (): Promise<void> => undefined
}

export const keyboard = {
  config: { autoDelayMs: 0 },
  type: async (): Promise<void> => undefined,
  pressKey: async (): Promise<void> => undefined,
  releaseKey: async (): Promise<void> => undefined
}

export const straightTo = (p: unknown): unknown => p
export class Point {
  constructor(
    public x: number,
    public y: number
  ) {}
}
