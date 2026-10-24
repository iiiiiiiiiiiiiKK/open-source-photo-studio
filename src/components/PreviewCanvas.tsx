import { useMemo } from 'react'
import type { DesignState, GeneratedCopy, ProjectInfo, ScreenshotAsset } from '../types'
import { usePreviewCanvas } from '../hooks/usePreviewCanvas'
import { getFrame } from '../render/geometry'
import { Spinner } from './ui'

interface Props {
  design: DesignState
  project: ProjectInfo | null
  images: string[]
  maxWidth: number
  showLabel?: boolean
}

export function PreviewCanvas({ design, project, images, maxWidth, showLabel = true }: Props) {
  const frame = getFrame(design.ratio)
  const targetWidth = useMemo(() => Math.max(240, Math.floor(maxWidth)), [maxWidth])
  const scale = Math.min(1, targetWidth / frame.width)
  const { canvasRef, rendering, missing, error } = usePreviewCanvas({
    design,
    images,
    project,
    width: targetWidth,
  })

  const ratio = frame.width / frame.height

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', alignItems: 'center' }}>
      <div
        className="canvas-shell"
        style={{
          width: '100%',
          maxWidth: Math.min(maxWidth, frame.width),
          aspectRatio: `${frame.width} / ${frame.height}`,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', borderRadius: 2 }}
          aria-label="展示图预览"
        />
        {rendering ? (
          <div className="canvas-loading">
            <span className="row" style={{ gap: 6 }}>
              <Spinner /> 渲染中
            </span>
          </div>
        ) : null}
        {error ? (
          <div className="canvas-loading" style={{ color: '#8f2410' }}>
            {error}
          </div>
        ) : null}
      </div>
      {showLabel ? (
        <div className="row" style={{ fontSize: 11, color: 'var(--muted)', gap: 10 }}>
          <span className="mono">
            预览 1:{(1 / scale).toFixed(2)} · 导出 {frame.exportWidth}×{frame.exportHeight}
          </span>
          {missing.length ? (
            <span className="badge badge-warn" title={missing.map((m) => m.url).join('\n')}>
              {missing.length} 张图未加载
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const ASSET_PRIORITY: Record<string, number> = {
  capture: 0,
  manual: 1,
  readme: 2,
  og: 3,
  icon: 4,
}

export function projectImageList(project: ProjectInfo | null, extra: ScreenshotAsset[] = []): string[] {
  if (!project) return extra.map((item) => item.url)
  const list: string[] = []
  const push = (url?: string | null) => {
    if (!url) return
    if (!url.trim()) return
    if (list.includes(url)) return
    list.push(url)
  }

  // 主图优先用真实截图，其次 README 配图，最后才是社交分享图与 favicon
  const ordered = [...extra, ...(project.screenshots || [])]
    .filter((item) => item && item.url)
    .sort((a, b) => (ASSET_PRIORITY[a.kind] ?? 9) - (ASSET_PRIORITY[b.kind] ?? 9))

  for (const shot of ordered) push(shot.url)
  if (project.source === 'github') {
    for (const image of project.readmeImages || []) push(image)
    push(project.socialPreview)
  }
  if (project.homepageMeta?.ogImage) push(project.homepageMeta.ogImage)
  if (project.ogImage) push(project.ogImage)
  if (project.icon) push(project.icon)
  return list
}

export function copyToText(copy: GeneratedCopy | null, project: ProjectInfo | null, design: DesignState): string {
  const lines: string[] = []
  if (!copy) {
    lines.push(design.title)
    if (design.oneLiner) lines.push('', design.oneLiner)
    if (project?.sourceUrl) lines.push('', project.sourceUrl)
    return lines.join('\n')
  }
  lines.push(design.title)
  if (design.oneLiner) lines.push('', design.oneLiner)
  if (design.highlights.length) {
    lines.push('', '亮点：')
    design.highlights.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
  }
  if (design.body) lines.push('', design.body)
  if (project?.sourceUrl) lines.push('', `项目地址：${project.sourceUrl}`)
  return lines.join('\n')
}
