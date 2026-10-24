import { useCallback, useMemo, useRef, useState } from 'react'

export interface HistoryState<T> {
  value: T
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  set: (next: T, options?: { merge?: boolean; mergeKey?: string }) => void
  replace: (next: T) => void
  depth: number
}

const LIMIT = 80

interface Stack<T> {
  items: T[]
  index: number
}

/**
 * 撤销 / 重做栈（单一状态对象，避免 stack 与 index 不同步）。
 * merge=true + 相同 mergeKey 且在 900ms 内，会合并为一次修改，适合滑杆。
 */
export function useHistory<T>(initial: T): HistoryState<T> {
  const [state, setState] = useState<Stack<T>>({ items: [initial], index: 0 })
  const mergeRef = useRef<{ key: string | null; time: number }>({ key: null, time: 0 })

  const set = useCallback((next: T, options?: { merge?: boolean; mergeKey?: string }) => {
    setState((prev) => {
      const current = prev.items[prev.index]
      if (JSON.stringify(current) === JSON.stringify(next)) return prev

      const now = Date.now()
      const key = options?.mergeKey ?? null
      const canMerge =
        Boolean(options?.merge) &&
        key !== null &&
        key === mergeRef.current.key &&
        now - mergeRef.current.time < 900 &&
        prev.index > 0

      mergeRef.current = { key, time: now }

      if (canMerge) {
        const items = [...prev.items.slice(0, prev.index), next]
        return { items: items.slice(-LIMIT), index: Math.min(prev.index, items.length - 1) }
      }
      const trimmed = [...prev.items.slice(0, prev.index + 1), next]
      const items = trimmed.length > LIMIT ? trimmed.slice(trimmed.length - LIMIT) : trimmed
      return { items, index: items.length - 1 }
    })
  }, [])

  const replace = useCallback((next: T) => {
    mergeRef.current = { key: null, time: 0 }
    setState({ items: [next], index: 0 })
  }, [])

  const undo = useCallback(() => {
    mergeRef.current = { key: null, time: 0 }
    setState((prev) => ({ ...prev, index: Math.max(0, prev.index - 1) }))
  }, [])

  const redo = useCallback(() => {
    mergeRef.current = { key: null, time: 0 }
    setState((prev) => ({ ...prev, index: Math.min(prev.items.length - 1, prev.index + 1) }))
  }, [])

  return useMemo(
    () => ({
      value: state.items[state.index],
      canUndo: state.index > 0,
      canRedo: state.index < state.items.length - 1,
      undo,
      redo,
      set,
      replace,
      depth: state.items.length,
    }),
    [state, set, undo, redo, replace]
  )
}
