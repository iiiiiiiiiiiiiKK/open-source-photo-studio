import { useMemo, useState } from 'react'
import type { DesignState, ProjectInfo, RatioId } from '../types'
import { EXPORT_SIZES, RATIO_LIST } from '../render/geometry'
import { renderToPngBlob } from '../render/renderDesign'
import { downloadBlob, sanitizeFilename, cx } from '../lib/util'
import { Spinner } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  design: DesignState
  project: ProjectInfo | null
  images: string[]
  onNeedRatio?: (ratio: RatioId) => void
}

interface Check {
  kind: 'ok' | 'warn' | 'err'
  text: string
}

function runChecks(design: DesignState, project: ProjectInfo | null, images: string[]): Check[] {
  const checks: Check[] = []

  if (!design.title.trim()) checks.push({ kind: 'err', text: '标题为空，导出后图片会缺少项目名' })
  else if (design.title.length > 34) checks.push({ kind: 'warn', text: `标题有 ${design.title.length} 字，会自动缩小字号或换行` })
  else checks.push({ kind: 'ok', text: '标题已填写' })

  if (!design.oneLiner.trim()) checks.push({ kind: 'warn', text: '一句话介绍为空，版面会留白' })
  else if (design.oneLiner.length > 120) checks.push({ kind: 'warn', text: '一句话介绍偏长，将被截断并加省略号' })
  else checks.push({ kind: 'ok', text: '一句话介绍正常' })

  if (design.showHighlights) {
    if (design.highlights.filter((h) => h.trim()).length < 3) {
      checks.push({ kind: 'warn', text: '亮点少于 3 条，建议补齐后再发布' })
    } else {
      checks.push({ kind: 'ok', text: `亮点 ${design.highlights.filter((h) => h.trim()).length} 条` })
    }
  }

  const unknown = design.metrics.filter((m) => m.visible && !m.known)
  if (unknown.length) {
    checks.push({ kind: 'warn', text: `${unknown.map((m) => m.label).join('、')} 为"未知"，将在图中显示为未知或隐藏` })
  } else if (design.metrics.length && design.showMetrics) {
    checks.push({ kind: 'ok', text: `指标 ${design.metrics.filter((m) => m.visible).length} 项均有真实数据` })
  }

  if (!images.length) {
    checks.push({ kind: 'warn', text: '没有可用图片，模板会改用数据面板或留白' })
  } else {
    checks.push({ kind: 'ok', text: `可用素材 ${images.length} 张` })
  }

  if (project?.source === 'manual') {
    checks.push({ kind: 'warn', text: '当前是手动填写模式，数据未经自动核验，发布前请自查' })
  }
  if (project?.source === 'github' && project.pushedAt) {
    const days = Math.floor((Date.now() - Date.parse(project.pushedAt)) / 86400000)
    if (days > 365) checks.push({ kind: 'warn', text: `仓库最后一次提交是 ${days} 天前，可能已不活跃` })
  }

  const target = EXPORT_SIZES[design.ratio]
  checks.push({ kind: 'ok', text: `导出尺寸 ${target.width}×${target.height}（${design.ratio}）` })
  return checks
}

export function ExportDialog({ open, onClose, design, project, images }: Props) {
  const [busy, setBusy] = useState<'one' | 'all' | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string[]>([])
  const checks = useMemo(() => runChecks(design, project, images), [design, project, images])
  const worst = checks.some((c) => c.kind === 'err') ? 'err' : checks.some((c) => c.kind === 'warn') ? 'warn' : 'ok'

  if (!open) return null

  const baseName = sanitizeFilename(project?.name || design.title || 'project-card')

  async function exportOne() {
    setBusy('one')
    setError('')
    try {
      const { blob, frame } = await renderToPngBlob(design, images, {
        project,
        avatar: project?.ownerAvatar,
        icon: project?.icon,
      })
      const name = `${baseName}-${design.ratio.replace(':', 'x')}-${frame.exportWidth}x${frame.exportHeight}.png`
      downloadBlob(blob, name)
      setDone([name])
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setBusy(null)
    }
  }

  async function exportAll() {
    setBusy('all')
    setError('')
    const names: string[] = []
    try {
      for (const ratio of RATIO_LIST) {
        const variant: DesignState = { ...design, ratio: ratio.id }
        const { blob, frame } = await renderToPngBlob(variant, images, {
          project,
          avatar: project?.ownerAvatar,
          icon: project?.icon,
        })
        const name = `${baseName}-${ratio.id.replace(':', 'x')}-${frame.exportWidth}x${frame.exportHeight}.png`
        downloadBlob(blob, name)
        names.push(name)
        await new Promise((resolve) => setTimeout(resolve, 320))
      }
      setDone(names)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">导出 PNG</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div
            className="status-line"
            data-tone={worst === 'ok' ? 'ok' : worst === 'warn' ? 'warn' : 'err'}
            style={{ fontWeight: 550 }}
          >
            {worst === 'ok' ? '检查通过，可以直接导出' : worst === 'warn' ? '有几点建议，仍可继续导出' : '有必须修复的问题'}
          </div>

          <div className="check-list">
            {checks.map((check, index) => (
              <div className="check-item" key={`${check.text}-${index}`}>
                <span className="check-dot" data-kind={check.kind}>
                  {check.kind === 'ok' ? '✓' : '!'}
                </span>
                <span>{check.text}</span>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="field">
            <div className="field-label">导出尺寸</div>
            <div className="stack" style={{ gap: 6 }}>
              {RATIO_LIST.map((ratio) => {
                const size = EXPORT_SIZES[ratio.id]
                return (
                  <div key={ratio.id} className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ fontWeight: 600 }}>
                      {ratio.label}
                      {design.ratio === ratio.id ? <span className="badge" style={{ marginLeft: 6 }}>当前</span> : null}
                    </span>
                    <span className="mono" style={{ color: 'var(--muted)' }}>
                      {size.width} × {size.height}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="field-hint">
              所有尺寸共用同一套排版坐标，按 1.5x–2x 渲染，保证文字与细线清晰。PNG 无损，可直接上传社交平台。
            </div>
          </div>

          {done.length ? (
            <div className="status-line" data-tone="ok">
              已导出 {done.length} 个文件：{done.join('、')}
            </div>
          ) : null}
          {error ? (
            <div className="status-line" data-tone="err">
              {error}
            </div>
          ) : null}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={exportOne} disabled={busy !== null}>
            {busy === 'one' ? (
              <>
                <Spinner /> 导出中…
              </>
            ) : (
              `导出 ${design.ratio} PNG`
            )}
          </button>
          <button type="button" className="btn" onClick={exportAll} disabled={busy !== null}>
            {busy === 'all' ? (
              <>
                <Spinner /> 三种比例…
              </>
            ) : (
              '导出全部三种比例'
            )}
          </button>
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy !== null}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
