import { useEffect, useRef, useState } from 'react'
import type { DesignState, ProjectInfo, TemplateId } from '../types'
import { TEMPLATES, TEMPLATE_MAP } from '../render/templates'
import { renderDesign } from '../render/renderDesign'

interface Props {
  design: DesignState
  images: string[]
  project: ProjectInfo | null
  onSelect: (id: TemplateId) => void
  compact?: boolean
}

/** 每个模板的缩略图都用真实的渲染引擎生成，确保预览与最终结果一致 */
export function TemplatePicker({ design, images, project, onSelect, compact }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const next: Record<string, string> = {}
      for (const template of TEMPLATES) {
        if (cancelled) return
        try {
          const previewDesign: DesignState = {
            ...design,
            template: template.id as TemplateId,
            accent: design.accent,
            background: template.defaultBackground,
          }
          const result = await renderDesign(
            previewDesign,
            images,
            { project, avatar: project?.ownerAvatar, icon: project?.icon },
            { exportScale: 0.24 }
          )
          next[template.id] = result.canvas.toDataURL('image/png')
        } catch {
          /* 单个模板失败不影响其他缩略图 */
        }
      }
      if (!cancelled) setThumbs(next)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [images.join('|'), project?.name, design.font, design.ratio, design.title, design.showMetrics, design.showHighlights])

  return (
    <div className="template-grid" style={compact ? { gridTemplateColumns: '1fr 1fr' } : undefined}>
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          className="template-card"
          data-active={design.template === template.id}
          onClick={() => onSelect(template.id as TemplateId)}
          title={template.tagline}
        >
          <div className="template-thumb">
            {thumbs[template.id] ? (
              <img src={thumbs[template.id]} alt={template.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            )}
          </div>
          <div className="template-caption">
            <div className="template-name">{template.name}</div>
            <div className="template-tag">{template.tagline}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

export function templateName(id: string): string {
  return TEMPLATE_MAP[id]?.name || id
}
