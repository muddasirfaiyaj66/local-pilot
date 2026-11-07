import { useCallback, useState } from 'react'
import { usePersistentState } from './usePersistentState'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface ResizableOptions {
  key: string
  initial: number
  min: number
  max: number
  /** True when the pane is on the right: dragging left should widen it. */
  invert?: boolean
}

/** Drag-to-resize width, persisted to localStorage. */
export function useResizable({ key, initial, min, max, invert = false }: ResizableOptions): {
  width: number
  dragging: boolean
  onHandlePointerDown: (event: React.PointerEvent) => void
} {
  const [width, setWidth] = usePersistentState(key, initial)
  const [dragging, setDragging] = useState(false)

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent): void => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      setDragging(true)
      const onMove = (moveEvent: PointerEvent): void => {
        const delta = invert ? startX - moveEvent.clientX : moveEvent.clientX - startX
        setWidth(clamp(startWidth + delta, min, max))
      }
      const onUp = (): void => {
        setDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [width, invert, min, max, setWidth]
  )

  return { width, dragging, onHandlePointerDown }
}
