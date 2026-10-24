import { useEffect, useRef, useState } from 'react'
import type { DesignState, ProjectInfo } from '../types'
import { renderDesign } from '../render/renderDesign'
import { getFrame } from '../render/geometry'

interface Options {
  design: DesignState
  images: string[]
  project: ProjectInfo | null
  /** 预览目标宽度（CSS 像素） */
  width: number
  enabled?: boolean
}

/**
 * 把设计稿渲染成真实像素的 canvas（不只是 DOM 预览），
 * 因此预览与导出完全一致。
 */
export function usePreviewCanvas({ design, images, project, width, enabled = true }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [rendering, setRendering] = useState(false)
  const [missing, setMissing] = useState<{ url: string; reason: string }[]>([])
  const [error, setError] = useState<string>('')
  const runIdRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || width <= 0) return
    const runId = ++runIdRef.current
    const frame = getFrame(design.ratio)
    const scale = Math.max(0.2, Math.min(3, width / frame.width))

    const perform = async () => {
      setRendering(true)
      setError('')
      try {
        const result = await renderDesign(
          design,
          images,
          { project, avatar: project?.ownerAvatar, icon: project?.icon },
          { exportScale: scale }
        )
        if (runId !== runIdRef.current) return
        const host = canvasRef.current
        if (!host) return
        host.width = result.canvas.width
        host.height = result.canvas.height
        const ctx = host.getContext('2d')
        ctx?.drawImage(result.canvas, 0, 0)
        setMissing(result.missing)
      } catch (err) {
        if (runId !== runIdRef.current) return
        setError(err instanceof Error ? err.message : '渲染失败')
      } finally {
        if (runId === runIdRef.current) setRendering(false)
      }
    }

    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(perform, 120)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(design), images.join('|'), project?.name, width, enabled])

  return { canvasRef, rendering, missing, error }
}
