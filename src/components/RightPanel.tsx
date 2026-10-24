import { useMemo, useState } from 'react'
import type { DesignState, ProjectInfo, RatioId, TemplateId } from '../types'
import { RATIO_LIST } from '../render/geometry'
import { TEMPLATE_MAP, TEMPLATES } from '../render/templates'
import { ACCENT_PRESETS, BACKGROUND_PRESETS, FONT_OPTIONS } from '../state/design'
import { cx } from '../lib/util'
import { SectionHead, Slider, Toggle } from './ui'
import { TemplatePicker } from './TemplatePicker'

interface Props {
  design: DesignState
  project: ProjectInfo | null
  images: string[]
  onPatch: (patch: Partial<DesignState>, mergeKey?: string) => void
  onSelectTemplate: (id: TemplateId) => void
  onCopyText: () => void
  copied: boolean
}

type Tab = 'template' | 'style' | 'display'

export function RightPanel({ design, project, images, onPatch, onSelectTemplate, onCopyText, copied }: Props) {
  const [tab, setTab] = useState<Tab>('template')

  return (
    <aside className="panel panel-right">
      <div className="panel-head">
        <div className="seg" style={{ width: '100%' }}>
          {(
            [
              ['template', '模板'],
              ['style', '样式'],
              ['display', '显示'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="seg-item"
              data-active={tab === key}
              style={{ flex: 1 }}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-body scroll-y" style={{ flex: 1 }}>
        {tab === 'template' ? (
          <>
            <div>
              <SectionHead title="输出比例" />
              <div className="seg" style={{ width: '100%' }}>
                {RATIO_LIST.map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    className="seg-item"
                    data-active={design.ratio === ratio.id}
                    style={{ flex: 1 }}
                    title={ratio.hint}
                    onClick={() => onPatch({ ratio: ratio.id as RatioId })}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <SectionHead title="模板" />
              <TemplatePicker design={design} images={images} project={project} onSelect={onSelectTemplate} />
              <div className="field-hint" style={{ marginTop: 8 }}>
                {TEMPLATE_MAP[design.template]?.name}：{TEMPLATE_MAP[design.template]?.tagline}
              </div>
            </div>

            <div>
              <SectionHead title="文案" />
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={onCopyText} style={{ flex: 1 }}>
                  {copied ? '已复制' : '复制文案'}
                </button>
                <a
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  href={project?.sourceUrl || '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(event) => {
                    if (!project?.sourceUrl) event.preventDefault()
                  }}
                >
                  打开原链接
                </a>
              </div>
            </div>
          </>
        ) : null}

        {tab === 'style' ? (
          <>
            <div>
              <SectionHead title="强调色" />
              <div className="color-swatches">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="swatch"
                    style={{ background: preset.value }}
                    data-active={design.accent.toLowerCase() === preset.value.toLowerCase()}
                    title={preset.name}
                    onClick={() => onPatch({ accent: preset.value })}
                    aria-label={preset.name}
                  />
                ))}
              </div>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <input
                  className="swatch-input"
                  type="color"
                  value={design.accent}
                  onChange={(event) => onPatch({ accent: event.target.value }, 'accent')}
                  aria-label="自定义强调色"
                  style={{ width: 44 }}
                />
                <input
                  className="input mono"
                  value={design.accent}
                  onChange={(event) => {
                    const value = event.target.value
                    if (/^#[0-9a-fA-F]{0,6}$/.test(value)) onPatch({ accent: value }, 'accenthex')
                  }}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            <div>
              <SectionHead title="背景" />
              <div className="color-swatches">
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="swatch"
                    style={{ background: preset.value }}
                    data-active={design.background.toLowerCase() === preset.value.toLowerCase()}
                    title={preset.name}
                    onClick={() => onPatch({ background: preset.value })}
                    aria-label={preset.name}
                  />
                ))}
              </div>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <input
                  className="swatch-input"
                  type="color"
                  value={design.background}
                  onChange={(event) => onPatch({ background: event.target.value }, 'background')}
                  aria-label="自定义背景色"
                  style={{ width: 44 }}
                />
                <input
                  className="input mono"
                  value={design.background}
                  onChange={(event) => {
                    const value = event.target.value
                    if (/^#[0-9a-fA-F]{0,6}$/.test(value)) onPatch({ background: value }, 'bghex')
                  }}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            <div>
              <SectionHead title="字体" />
              <div className="stack" style={{ gap: 6 }}>
                {FONT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="btn"
                    style={{
                      justifyContent: 'flex-start',
                      fontFamily:
                        option.id === 'serif'
                          ? 'var(--font-serif)'
                          : option.id === 'mono'
                            ? 'var(--font-mono)'
                            : 'var(--font-ui)',
                      borderColor: design.font === option.id ? 'var(--ink)' : undefined,
                      boxShadow: design.font === option.id ? '0 0 0 1px var(--ink)' : undefined,
                    }}
                    onClick={() => onPatch({ font: option.id })}
                  >
                    {option.sample}
                  </button>
                ))}
              </div>
            </div>

            <Slider
              label="标题字号"
              value={design.titleScale}
              min={0.7}
              max={1.25}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => onPatch({ titleScale: v }, 'scale')}
            />

            <Slider
              label="纸张颗粒"
              value={design.texture}
              min={0}
              max={1}
              step={0.02}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => onPatch({ texture: v }, 'texture')}
            />
          </>
        ) : null}

        {tab === 'display' ? (
          <>
            <div>
              <SectionHead title="显示内容" />
              <div className="stack" style={{ gap: 0 }}>
                <Toggle on={design.showHighlights} onChange={(next) => onPatch({ showHighlights: next })} label="核心亮点" />
                <Toggle on={design.showMetrics} onChange={(next) => onPatch({ showMetrics: next })} label="指标条" />
                <Toggle on={design.showTags} onChange={(next) => onPatch({ showTags: next })} label="标签" />
                <Toggle on={design.showFooter} onChange={(next) => onPatch({ showFooter: next })} label="页脚链接" />
              </div>
            </div>

            <div>
              <SectionHead title="徽标文案" />
              <div className="field">
                <div className="field-label">
                  <span>海报徽标</span>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'none' }}>仅海报模板</span>
                </div>
                <input
                  className="input"
                  value={design.badge}
                  onChange={(event) => onPatch({ badge: event.target.value }, 'badge')}
                  placeholder={project?.latestRelease?.tag ? `RELEASE ${project.latestRelease.tag}` : 'NEW RELEASE'}
                  maxLength={28}
                />
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <div className="field-label">
                  <span>页脚 / 终端末行</span>
                </div>
                <input
                  className="input mono"
                  value={design.footer}
                  onChange={(event) => onPatch({ footer: event.target.value }, 'footer')}
                  placeholder="npm run build"
                  maxLength={48}
                />
              </div>
            </div>

            <div>
              <SectionHead title="数据核对" />
              <div className="check-list">
                {design.metrics.map((metric) => (
                  <div className="check-item" key={metric.key}>
                    <span className="check-dot" data-kind={metric.known ? 'ok' : 'warn'}>
                      {metric.known ? '✓' : '!'}
                    </span>
                    <span>
                      {metric.label}：{metric.known ? metric.value : '未知（未获取到，不会编造）'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="field-hint" style={{ marginTop: 8 }}>
                数据来自 GitHub 公开接口或页面元信息；标注"未知"的项不会出现在导出图里。
              </div>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  )
}
