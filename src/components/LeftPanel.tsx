import { useState } from 'react'
import type { DesignState, ProjectInfo, ScreenshotAsset } from '../types'
import { cx } from '../lib/util'
import { toProxiedUrl } from '../render/assets'
import { Field, SectionHead, StatusLine, Toggle } from './ui'

interface Props {
  design: DesignState
  project: ProjectInfo | null
  images: string[]
  assets: ScreenshotAsset[]
  onPatch: (patch: Partial<DesignState>, mergeKey?: string) => void
  onSelectImage: (url: string | null) => void
  onUpload: (file: File) => Promise<void>
  onReResolve: () => void
  onManual: () => void
  reResolving: boolean
  warnings: string[]
}

export function LeftPanel({
  design,
  project,
  images,
  assets,
  onPatch,
  onSelectImage,
  onUpload,
  onReResolve,
  onManual,
  reResolving,
  warnings,
}: Props) {
  const [uploadError, setUploadError] = useState('')

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setUploadError('')
    for (const file of Array.from(files).slice(0, 4)) {
      if (!file.type.startsWith('image/')) {
        setUploadError('只支持图片文件')
        continue
      }
      if (file.size > 12 * 1024 * 1024) {
        setUploadError('图片不能超过 12MB')
        continue
      }
      try {
        await onUpload(file)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : '上传失败')
      }
    }
  }

  return (
    <aside className="panel panel-left">
      <div className="panel-head">
        <div className="panel-title">项目来源</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReResolve} disabled={reResolving} title="重新读取元信息">
          {reResolving ? '读取中…' : '重新读取'}
        </button>
      </div>
      <div className="panel-body scroll-y" style={{ flex: 1 }}>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className={project?.source === 'github' ? 'badge badge-ok' : project?.source === 'manual' ? 'badge' : 'badge badge-warn'}>
              {project?.source === 'github' ? 'GitHub' : project?.source === 'manual' ? '手动填写' : '网站'}
            </span>
            {project?.license ? <span className="badge">{project.license}</span> : null}
            {project?.archived ? <span className="badge badge-warn">已归档</span> : null}
          </div>
          <div style={{ fontSize: 13, fontWeight: 650, wordBreak: 'break-all' }}>
            {project?.fullName || project?.title || design.title}
          </div>
          {project?.sourceUrl ? (
            <a
              href={project.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mono"
              style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', textDecoration: 'none' }}
            >
              {project.sourceUrl}
            </a>
          ) : null}
          {project?.description ? (
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>{project.description}</div>
          ) : null}
        </div>

        {warnings.length ? (
          <div className="notice-list">
            {warnings.slice(0, 4).map((warning) => (
              <div key={warning} className="status-line" data-tone="warn" style={{ fontSize: 11.5 }}>
                {warning}
              </div>
            ))}
          </div>
        ) : null}

        <div>
          <SectionHead title="文案" />
          <div className="stack" style={{ gap: 10 }}>
            <Field label="主标题">
              <input
                className="input"
                value={design.title}
                onChange={(event) => onPatch({ title: event.target.value }, 'title')}
                placeholder="项目名称"
                maxLength={90}
              />
            </Field>
            <Field label="副标题" hint="展示作者、语言、许可证等，可留空">
              <input
                className="input"
                value={design.subtitle}
                onChange={(event) => onPatch({ subtitle: event.target.value }, 'subtitle')}
                placeholder="author · TypeScript · MIT"
                maxLength={90}
              />
            </Field>
            <Field label="一句话介绍">
              <textarea
                className="textarea"
                value={design.oneLiner}
                onChange={(event) => onPatch({ oneLiner: event.target.value }, 'oneLiner')}
                placeholder="用一句中文说清它解决什么问题"
                rows={3}
                maxLength={260}
              />
            </Field>
            <Field label="正文说明" hint="仅部分模板使用（编辑部 / 终端）">
              <textarea
                className="textarea"
                value={design.body}
                onChange={(event) => onPatch({ body: event.target.value }, 'body')}
                rows={3}
                maxLength={600}
              />
            </Field>
          </div>
        </div>

        <div>
          <SectionHead
            title={`核心亮点 · ${design.highlights.length}`}
            action={
              design.highlights.length < 5 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onPatch({ highlights: [...design.highlights, ''] })}
                >
                  + 添加
                </button>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>最多 5 条</span>
              )
            }
          />
          <div className="stack" style={{ gap: 7 }}>
            {design.highlights.map((item, index) => (
              <div className="hl-row" key={`hl-${index}`}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', paddingTop: 8, width: 14 }}>
                  {index + 1}
                </span>
                <textarea
                  className="textarea"
                  value={item}
                  rows={2}
                  onChange={(event) => {
                    const next = [...design.highlights]
                    next[index] = event.target.value
                    onPatch({ highlights: next }, `hl-${index}`)
                  }}
                  placeholder="一句具体的能力，不要空话"
                  maxLength={140}
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{ marginTop: 2 }}
                  onClick={() => onPatch({ highlights: design.highlights.filter((_, i) => i !== index) })}
                  aria-label="删除亮点"
                >
                  ✕
                </button>
              </div>
            ))}
            {!design.highlights.length ? (
              <div className="field-hint">还没有亮点。点"添加"写一条，或在右侧重新生成文案。</div>
            ) : null}
          </div>
        </div>

        <div>
          <SectionHead title="素材" action={<span style={{ fontSize: 11, color: 'var(--muted)' }}>{images.length} 张</span>} />
          <div className="asset-grid">
            {assets.slice(0, 11).map((asset) => {
              const active = design.imageId === asset.url || (!design.imageId && images[0] === asset.url)
              return (
                <button
                  key={asset.url}
                  type="button"
                  className="asset-tile"
                  data-active={active}
                  onClick={() => onSelectImage(design.imageId === asset.url ? null : asset.url)}
                  title={`${asset.label}${asset.width ? ` · ${asset.width}×${asset.height}` : ''}`}
                >
                  <img src={toProxiedUrl(asset.url)} alt={asset.label} loading="lazy" />
                  <span
                    style={{
                      position: 'absolute',
                      inset: 'auto 0 0 0',
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      fontSize: 9,
                      padding: '2px 3px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {asset.label}
                  </span>
                </button>
              )
            })}
            <label className="asset-tile" style={{ display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="上传本地图片">
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(event) => handleFiles(event.target.files)}
              />
              <span className="asset-tile-empty">
                + 上传
                <br />
                本地图片
              </span>
            </label>
          </div>
          {uploadError ? (
            <div className="status-line" data-tone="err" style={{ marginTop: 8, fontSize: 11.5 }}>
              {uploadError}
            </div>
          ) : null}
          <div className="field-hint" style={{ marginTop: 6 }}>
            点选决定主图。没有截图时模板会自动切换到数据面板，不会出现空框。
          </div>
        </div>

        <div>
          <SectionHead title="图片裁切" />
          <div className="stack" style={{ gap: 10 }}>
            <div className="field">
              <div className="field-label">
                <span>裁切方式</span>
              </div>
              <div className="seg" style={{ width: '100%' }}>
                {(
                  [
                    ['top', '顶部', '按宽度铺满，显示页面第一屏'],
                    ['cover', '填满', '居中裁切填满整个区域'],
                    ['contain', '完整', '完整显示，可能留边'],
                  ] as const
                ).map(([value, label, title]) => (
                  <button
                    key={value}
                    type="button"
                    className="seg-item"
                    data-active={design.imageTreatment === value}
                    style={{ flex: 1 }}
                    title={title}
                    onClick={() => onPatch({ imageTreatment: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="field-hint">
                {design.imageTreatment === 'top'
                  ? '页面顶部完整可见，最接近真实浏览器的第一屏。'
                  : design.imageTreatment === 'cover'
                    ? '铺满整个区域，超出部分被裁掉。'
                    : '整张图完整显示，两侧或上下会留边。'}
              </div>
            </div>
            <SliderRow
              label="缩放"
              value={design.imageZoom}
              min={0.6}
              max={3}
              step={0.02}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => onPatch({ imageZoom: v }, 'zoom')}
            />
            <SliderRow
              label="水平位移"
              value={design.imageOffsetX}
              min={-1}
              max={1}
              step={0.02}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onPatch({ imageOffsetX: v }, 'offx')}
            />
            <SliderRow
              label="垂直位移"
              value={design.imageOffsetY}
              min={-1}
              max={1}
              step={0.02}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onPatch({ imageOffsetY: v }, 'offy')}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onPatch({ imageZoom: 1, imageOffsetX: 0, imageOffsetY: 0 })}
            >
              重置裁切
            </button>
          </div>
        </div>

        <div>
          <SectionHead title="指标显示" />
          <div className="stack" style={{ gap: 2 }}>
            {design.metrics.length ? (
              design.metrics.map((metric, index) => (
                <div className="toggle-row" key={metric.key}>
                  <div className="toggle-label">
                    <span>{metric.label}</span>
                    <span className="mono" style={{ fontSize: 11, color: metric.known ? 'var(--ink-2)' : 'var(--muted)' }}>
                      {metric.known ? metric.value : '未知'}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {!metric.known ? <span className="badge">未知</span> : null}
                    <button
                      type="button"
                      className="switch"
                      data-on={metric.visible}
                      aria-label={`显示 ${metric.label}`}
                      onClick={() => {
                        const next = [...design.metrics]
                        next[index] = { ...metric, visible: !metric.visible }
                        onPatch({ metrics: next })
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="field-hint">该项目没有可用的公开指标，模板会自动隐藏指标区。</div>
            )}
          </div>
        </div>

        <div>
          <SectionHead title="标签" />
          <div className="tag-list">
            {design.tags.map((tag, index) => (
              <span className="tag" key={`${tag}-${index}`}>
                {tag}
                <button type="button" onClick={() => onPatch({ tags: design.tags.filter((_, i) => i !== index) })} aria-label="移除标签">
                  ✕
                </button>
              </span>
            ))}
            {!design.tags.length ? <span className="field-hint">无标签</span> : null}
          </div>
        </div>

        <button type="button" className="btn btn-sm" onClick={onManual}>
          切换为手动填写
        </button>
      </div>
    </aside>
  )

}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <span className="mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {format(value)}
        </span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}


