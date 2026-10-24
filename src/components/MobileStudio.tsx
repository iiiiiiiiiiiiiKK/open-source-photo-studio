import { useState } from 'react'
import type { DesignState, GeneratedCopy, ProjectInfo, ScreenshotAsset, TemplateId } from '../types'
import { RATIO_LIST } from '../render/geometry'
import { ACCENT_PRESETS, BACKGROUND_PRESETS, FONT_OPTIONS } from '../state/design'
import { TemplatePicker } from './TemplatePicker'
import { PreviewCanvas } from './PreviewCanvas'
import { Toggle } from './ui'
import { toProxiedUrl } from '../render/assets'

type Tab = 'source' | 'template' | 'style' | 'export'

interface Props {
  design: DesignState
  project: ProjectInfo | null
  copy: GeneratedCopy | null
  images: string[]
  assets: ScreenshotAsset[]
  warnings: string[]
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  onPatch: (patch: Partial<DesignState>, mergeKey?: string) => void
  onSelectTemplate: (id: TemplateId) => void
  onSelectImage: (url: string | null) => void
  onUpload: (file: File) => Promise<void>
  onExport: () => void
  onSocial: () => void
  onBack: () => void
  onManual: () => void
  onRefreshCopy: () => void
  refreshing: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'source', label: '文案', icon: '✎' },
  { key: 'template', label: '模板', icon: '▦' },
  { key: 'style', label: '样式', icon: '◐' },
  { key: 'export', label: '预览', icon: '↑' },
]

/** 移动端：分步骤编辑，绝不在窄屏上硬塞三栏 */
export function MobileStudio(props: Props) {
  const {
    design,
    project,
    copy,
    images,
    assets,
    warnings,
    activeTab,
    setActiveTab,
    onPatch,
    onSelectTemplate,
    onSelectImage,
    onUpload,
    onExport,
    onSocial,
    onBack,
    onManual,
    onRefreshCopy,
    refreshing,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onReset,
  } = props

  return (
    <div className="mobile-steps">
      <div
        className="row"
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg-panel)',
          gap: 6,
          flex: '0 0 auto',
        }}
      >
        <button type="button" className="icon-btn" onClick={onBack} aria-label="返回">
          ←
        </button>
        <div className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {design.title || '未命名项目'}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            {design.ratio} · {TABS.find((t) => t.key === activeTab)?.label}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onUndo} disabled={!canUndo} aria-label="撤销">
          ↶
        </button>
        <button type="button" className="icon-btn" onClick={onRedo} disabled={!canRedo} aria-label="重做">
          ↷
        </button>
      </div>

      {activeTab !== 'export' ? (
        <div className="mobile-stage">
          <PreviewCanvas design={design} project={project} images={images} maxWidth={420} showLabel={false} />
        </div>
      ) : null}

      <div className="mobile-body">
        {activeTab === 'source' ? (
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <div className="mobile-section-title">项目</div>
              <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span className={project?.source === 'github' ? 'badge badge-ok' : 'badge'}>
                  {project?.source === 'github' ? 'GitHub' : project?.source === 'manual' ? '手动' : '网站'}
                </span>
                {project?.license ? <span className="badge">{project.license}</span> : null}
                {project?.language ? <span className="badge">{project.language}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{project?.sourceUrl}</div>
            </div>

            <div className="field">
              <div className="field-label">主标题</div>
              <input className="input" value={design.title} onChange={(e) => onPatch({ title: e.target.value }, 'title')} maxLength={90} />
            </div>
            <div className="field">
              <div className="field-label">副标题</div>
              <input className="input" value={design.subtitle} onChange={(e) => onPatch({ subtitle: e.target.value }, 'subtitle')} maxLength={90} />
            </div>
            <div className="field">
              <div className="field-label">一句话介绍</div>
              <textarea
                className="textarea"
                value={design.oneLiner}
                onChange={(e) => onPatch({ oneLiner: e.target.value }, 'oneLiner')}
                rows={3}
                maxLength={260}
              />
            </div>

            <div>
              <div className="mobile-section-title">亮点（{design.highlights.length}/5）</div>
              <div className="stack" style={{ gap: 8 }}>
                {design.highlights.map((item, index) => (
                  <div className="hl-row" key={index}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', paddingTop: 10 }}>
                      {index + 1}
                    </span>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={item}
                      onChange={(e) => {
                        const next = [...design.highlights]
                        next[index] = e.target.value
                        onPatch({ highlights: next }, `hl-${index}`)
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onPatch({ highlights: design.highlights.filter((_, i) => i !== index) })}
                      aria-label="删除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {design.highlights.length < 5 ? (
                  <button type="button" className="btn btn-sm" onClick={() => onPatch({ highlights: [...design.highlights, ''] })}>
                    + 添加亮点
                  </button>
                ) : null}
              </div>
            </div>

            <div>
              <div className="mobile-section-title">素材</div>
              <div className="asset-grid">
                {assets.slice(0, 7).map((asset) => (
                  <button
                    key={asset.url}
                    type="button"
                    className="asset-tile"
                    data-active={design.imageId === asset.url || (!design.imageId && images[0] === asset.url)}
                    onClick={() => onSelectImage(design.imageId === asset.url ? null : asset.url)}
                  >
                    <img src={toProxiedUrl(asset.url)} alt={asset.label} loading="lazy" />
                  </button>
                ))}
                <label className="asset-tile" style={{ display: 'grid', placeItems: 'center' }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) onUpload(file).catch(() => {})
                    }}
                  />
                  <span className="asset-tile-empty">+ 上传</span>
                </label>
              </div>
            </div>

            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={onRefreshCopy} disabled={refreshing}>
                {refreshing ? '生成中…' : '重新生成文案'}
              </button>
              <button type="button" className="btn btn-sm" onClick={onManual}>
                手动填写
              </button>
              {warnings.length ? (
                <span className="badge badge-warn" title={warnings.join('\n')}>
                  {warnings.length} 条提示
                </span>
              ) : null}
            </div>
            {copy?.facts?.length ? (
              <div className="field-hint">原始资料：{copy.facts.slice(0, 3).map((f) => f.label).join(' / ')}（可核对）</div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'template' ? (
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <div className="mobile-section-title">比例</div>
              <div className="seg" style={{ width: '100%' }}>
                {RATIO_LIST.map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    className="seg-item"
                    data-active={design.ratio === ratio.id}
                    style={{ flex: 1 }}
                    onClick={() => onPatch({ ratio: ratio.id })}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mobile-section-title">模板</div>
              <TemplatePicker design={design} images={images} project={project} onSelect={onSelectTemplate} compact />
            </div>
            <div>
              <div className="mobile-section-title">显示内容</div>
              <Toggle on={design.showHighlights} onChange={(v) => onPatch({ showHighlights: v })} label="核心亮点" />
              <Toggle on={design.showMetrics} onChange={(v) => onPatch({ showMetrics: v })} label="指标条" />
              <Toggle on={design.showFooter} onChange={(v) => onPatch({ showFooter: v })} label="页脚链接" />
            </div>
          </div>
        ) : null}

        {activeTab === 'style' ? (
          <div className="stack" style={{ gap: 16 }}>
            <div>
              <div className="mobile-section-title">强调色</div>
              <div className="color-swatches">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="swatch"
                    style={{ background: preset.value, width: 34, height: 34 }}
                    data-active={design.accent.toLowerCase() === preset.value.toLowerCase()}
                    onClick={() => onPatch({ accent: preset.value })}
                    aria-label={preset.name}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mobile-section-title">背景</div>
              <div className="color-swatches">
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="swatch"
                    style={{ background: preset.value, width: 34, height: 34 }}
                    data-active={design.background.toLowerCase() === preset.value.toLowerCase()}
                    onClick={() => onPatch({ background: preset.value })}
                    aria-label={preset.name}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mobile-section-title">字体</div>
              <div className="stack" style={{ gap: 6 }}>
                {FONT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="btn"
                    style={{
                      justifyContent: 'flex-start',
                      fontFamily:
                        option.id === 'serif' ? 'var(--font-serif)' : option.id === 'mono' ? 'var(--font-mono)' : 'var(--font-ui)',
                      borderColor: design.font === option.id ? 'var(--ink)' : undefined,
                    }}
                    onClick={() => onPatch({ font: option.id })}
                  >
                    {option.sample}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mobile-section-title">图片裁切</div>
              <div className="seg" style={{ width: '100%', marginBottom: 8 }}>
                {(
                  [
                    ['top', '顶部'],
                    ['cover', '填满'],
                    ['contain', '完整'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="seg-item"
                    data-active={design.imageTreatment === value}
                    style={{ flex: 1 }}
                    onClick={() => onPatch({ imageTreatment: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <div className="field-label">
                  <span>缩放</span>
                  <span className="mono">{design.imageZoom.toFixed(2)}×</span>
                </div>
                <input
                  className="range"
                  type="range"
                  min={0.6}
                  max={3}
                  step={0.02}
                  value={design.imageZoom}
                  onChange={(e) => onPatch({ imageZoom: Number(e.target.value) }, 'zoom')}
                />
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <div className="field-label">
                  <span>水平位移</span>
                  <span className="mono">{design.imageOffsetX.toFixed(2)}</span>
                </div>
                <input
                  className="range"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={design.imageOffsetX}
                  onChange={(e) => onPatch({ imageOffsetX: Number(e.target.value) }, 'offx')}
                />
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <div className="field-label">
                  <span>垂直位移</span>
                  <span className="mono">{design.imageOffsetY.toFixed(2)}</span>
                </div>
                <input
                  className="range"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={design.imageOffsetY}
                  onChange={(e) => onPatch({ imageOffsetY: Number(e.target.value) }, 'offy')}
                />
              </div>
            </div>
            <button type="button" className="btn btn-sm" onClick={onReset}>
              重置排版
            </button>
          </div>
        ) : null}

        {activeTab === 'export' ? (
          <div className="stack" style={{ gap: 14 }}>
            <div className="mobile-stage" style={{ borderRadius: 10, padding: 12 }}>
              <PreviewCanvas design={design} project={project} images={images} maxWidth={420} showLabel={false} />
            </div>
            <div className="mobile-section-title">导出</div>
            <div className="stack" style={{ gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
              {RATIO_LIST.map((ratio) => (
                <div key={ratio.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: design.ratio === ratio.id ? 650 : 400 }}>{ratio.label}</span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>
                    {ratio.id === '16:9' ? '2400×1350' : ratio.id === '1:1' ? '1800×1800' : '1800×2400'}
                  </span>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={onExport}>
              导出 PNG
            </button>
            <button type="button" className="btn btn-block" onClick={onSocial}>
              社交平台预览
            </button>
            <div className="field-hint">导出前会自动检查标题长度、未知指标和图片可用性。</div>
          </div>
        ) : null}
      </div>

      <nav className="mobile-tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="mobile-tab"
            data-active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

