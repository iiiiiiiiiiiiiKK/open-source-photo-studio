import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DesignState,
  ExtractResponse,
  GeneratedCopy,
  ProjectInfo,
  RatioId,
  ScreenshotAsset,
  TemplateId,
} from './types'
import { Landing, useHealth } from './components/Landing'
import { LeftPanel } from './components/LeftPanel'
import { RightPanel } from './components/RightPanel'
import { PreviewCanvas, copyToText, projectImageList } from './components/PreviewCanvas'
import { ExportDialog } from './components/ExportDialog'
import { ManualDialog } from './components/ManualDialog'
import { SocialPreview } from './components/SocialPreview'
import { MobileStudio } from './components/MobileStudio'
import { buildInitialDesign, switchTemplate } from './state/design'
import { useHistory } from './hooks/useHistory'
import { RequestError, buildManualProject, regenerateCopy } from './lib/api'
import { copyText, fileToDataUrl } from './lib/util'
import { TEMPLATE_MAP } from './render/templates'
import { getFrame, RATIO_LIST } from './render/geometry'

type Phase = 'landing' | 'studio'
type MobileTab = 'source' | 'template' | 'style' | 'export'

const EMPTY_DESIGN = buildInitialDesign(null, null)

export default function App() {
  const { health, error: healthError, mode } = useHealth()
  const [phase, setPhase] = useState<Phase>('landing')
  const [busy, setBusy] = useState(false)

  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [copy, setCopy] = useState<GeneratedCopy | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [assets, setAssets] = useState<ScreenshotAsset[]>([])
  const [uploaded, setUploaded] = useState<string[]>([])

  const design = useHistory<DesignState>(EMPTY_DESIGN)

  const [manualOpen, setManualOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [socialOpen, setSocialOpen] = useState(false)
  const [reResolving, setReResolving] = useState(false)
  const [refreshingCopy, setRefreshingCopy] = useState(false)
  const [copiedTweet, setCopiedTweet] = useState(false)
  const [copiedText, setCopiedText] = useState(false)
  const [aiUsed, setAiUsed] = useState(false)
  const [aiError, setAiError] = useState('')
  const [toast, setToast] = useState('')
  const [stageWidth, setStageWidth] = useState(760)
  const [mobileTab, setMobileTab] = useState<MobileTab>('source')
  const [thumb, setThumb] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const images = useMemo(() => {
    const base = projectImageList(project, assets)
    const all = [...uploaded, ...base]
    return all.filter((url, index) => all.indexOf(url) === index)
  }, [project, assets, uploaded])

  // 画布可用宽度（响应窗口尺寸）
  useEffect(() => {
    if (phase !== 'studio') return
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setStageWidth(Math.max(280, Math.min(rect.width - 60, 1180)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [phase])

  // 键盘快捷键
  useEffect(() => {
    if (phase !== 'studio') return
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey
      const target = event.target as HTMLElement | null
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        if (typing) return
        event.preventDefault()
        design.undo()
      } else if (meta && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        if (typing) return
        event.preventDefault()
        design.redo()
      } else if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        setExportOpen(true)
      } else if (meta && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setSocialOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, design])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const patchDesign = useCallback(
    (patch: Partial<DesignState>, mergeKey?: string) => {
      design.set({ ...design.value, ...patch }, mergeKey ? { merge: true, mergeKey } : undefined)
    },
    [design]
  )

  const applyResult = useCallback(
    (result: ExtractResponse | { project: ProjectInfo; copy: GeneratedCopy; warnings?: string[] }, options?: { template?: TemplateId; ratio?: RatioId; keepDesign?: boolean }) => {
      const nextProject = result.project
      const nextCopy = result.copy
      setProject(nextProject)
      setCopy(nextCopy)
      setWarnings((result as ExtractResponse).warnings || [])
      setAssets((result as ExtractResponse).screenshots || nextProject.screenshots || [])
      const baseDesign = buildInitialDesign(nextProject, nextCopy, options?.keepDesign ? design.value : null, options?.template, options?.ratio)
      if (options?.keepDesign) {
        design.set({
          ...baseDesign,
          template: design.value.template,
          ratio: design.value.ratio,
          accent: design.value.accent,
          background: design.value.background,
          font: design.value.font,
          titleScale: design.value.titleScale,
          texture: design.value.texture,
          title: baseDesign.title,
          oneLiner: baseDesign.oneLiner,
          metrics: baseDesign.metrics,
          highlights: baseDesign.highlights,
        })
      } else {
        design.replace(baseDesign)
      }
      setPhase('studio')
      setMobileTab('template')
    },
    [design]
  )

  const handleLoaded = useCallback(
    (result: ExtractResponse) => {
      applyResult(result)
      setAiUsed(result.ai?.used || false)
      setAiError(result.ai?.error || '')
    },
    [applyResult]
  )

  const handleManual = useCallback(
    async (payload: { name: string; description: string; url: string; owner: string; tags: string[]; highlights: string[] }) => {
      const result = await buildManualProject({
        name: payload.name,
        description: payload.description,
        url: payload.url,
        owner: payload.owner,
        tags: payload.tags,
      })
      const nextCopy: GeneratedCopy = {
        ...result.copy,
        mode: 'manual',
        highlights: payload.highlights.length
          ? payload.highlights.map((text) => ({ text, evidence: '用户手动填写' }))
          : result.copy.highlights,
      }
      applyResult({ project: result.project, copy: nextCopy, warnings: result.warnings })
      setManualOpen(false)
      setToast('已创建手动项目，可直接编辑')
    },
    [applyResult]
  )

  const handleReResolve = useCallback(async () => {
    const target = project?.sourceUrl
    if (!target) {
      setManualOpen(true)
      return
    }
    setReResolving(true)
    try {
      const { extractProject } = await import('./lib/api')
      const result = await extractProject({
        url: target,
        ai: false,
        withScreenshot: Boolean(health?.screenshot.available),
        viewport: 'desktop-1280',
      })
      applyResult(result, { keepDesign: true })
      setAiError(result.ai?.error || '')
      setToast('项目信息已刷新')
    } catch (error) {
      const message = error instanceof RequestError ? `${error.message}${error.hint ? `（${error.hint}）` : ''}` : '刷新失败'
      setToast(message)
    } finally {
      setReResolving(false)
    }
  }, [project, health, applyResult])

  const handleRefreshCopy = useCallback(async () => {
    if (!project) return
    setRefreshingCopy(true)
    setAiError('')
    try {
      const result = await regenerateCopy(project, Boolean(health?.ai.enabled))
      setCopy(result.copy)
      setAiUsed(result.ai.used)
      setAiError(result.ai.error || '')
      design.set({
        ...design.value,
        title: result.copy.title || design.value.title,
        oneLiner: result.copy.oneLiner || design.value.oneLiner,
        highlights: result.copy.highlights.map((h) => h.text).slice(0, 5),
        body: result.copy.body || design.value.body,
        metrics: result.copy.metrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          value: metric.value,
          known: metric.known,
          visible: true,
        })),
      })
      setToast(result.ai.used ? 'AI 文案已生成' : '文案已按公开资料重新生成')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '生成失败')
    } finally {
      setRefreshingCopy(false)
    }
  }, [project, health, design])

  const handleUpload = useCallback(
    async (file: File) => {
      const dataUrl = await fileToDataUrl(file)
      setUploaded((prev) => [dataUrl, ...prev].slice(0, 6))
      design.set({ ...design.value, imageId: dataUrl })
      setToast('已上传图片并设为封面')
    },
    [design]
  )

  const handleSelectTemplate = useCallback(
    (id: TemplateId) => {
      const next = switchTemplate(design.value, id, false)
      design.set(next)
    },
    [design]
  )

  const copyAllText = useCallback(async () => {
    const text = copyToText(copy, project, design.value)
    const ok = await copyText(text)
    setCopiedText(ok)
    setToast(ok ? '项目文案已复制' : '复制失败，请手动选择')
    setTimeout(() => setCopiedText(false), 2000)
  }, [copy, project, design.value])

  const copyTweet = useCallback(async () => {
    const ok = await copyText(copy?.tweet || design.value.oneLiner)
    setCopiedTweet(ok)
    setTimeout(() => setCopiedTweet(false), 2000)
  }, [copy, design.value.oneLiner])

  // 生成社交预览缩略图（复用渲染器）
  useEffect(() => {
    if (!socialOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const { renderDesign } = await import('./render/renderDesign')
        const result = await renderDesign(
          design.value,
          images,
          { project, avatar: project?.ownerAvatar, icon: project?.icon },
          { exportScale: 0.34 }
        )
        const url = result.canvas.toDataURL('image/png')
        if (!cancelled) setThumb(url)
      } catch {
        /* ignore */
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [socialOpen, design.value, images, project])

  function resetDesign() {
    if (!project) return
    design.replace(buildInitialDesign(project, copy, null, design.value.template, design.value.ratio))
    setToast('已重置为初始排版')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="7.5" stroke="#F5C451" strokeWidth="2" />
              <circle cx="12" cy="12" r="2.6" fill="#F5C451" />
            </svg>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            <span className="brand-name">开源项目照相馆</span>
            <span className="brand-sub">Open Source Photo Studio</span>
          </div>
        </div>

        {phase === 'studio' ? (
          <div className="row desktop-only" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPhase('landing')
              }}
            >
              ← 换一个项目
            </button>
            <button type="button" className="icon-btn" onClick={design.undo} disabled={!design.canUndo} title="撤销 (Ctrl+Z)">
              ↶
            </button>
            <button type="button" className="icon-btn" onClick={design.redo} disabled={!design.canRedo} title="重做 (Ctrl+Shift+Z)">
              ↷
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetDesign}>
              重置
            </button>
          </div>
        ) : null}

        <div className="spacer" />

        <div className="topbar-meta desktop-only">
          {project ? (
            <>
              <span className={project.source === 'github' ? 'badge badge-ok' : project.source === 'manual' ? 'badge' : 'badge badge-warn'}>
                {project.source === 'github' ? 'GitHub' : project.source === 'manual' ? '手动' : '网站'}
              </span>
              <a href={project.sourceUrl} target="_blank" rel="noreferrer noopener">
                {project.sourceUrl}
              </a>
            </>
          ) : (
            <span>{health?.screenshot.available ? '截图引擎就绪' : '服务端未连接'}</span>
          )}
        </div>

        <a
          href="https://x.com/0xkillcoin"
          target="_blank"
          rel="noopener noreferrer"
          className="topbar-author-link"
          title="作者 @0xkillcoin"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="desktop-only">@0xkillcoin</span>
        </a>

        {phase === 'studio' ? (
          <>
            <button type="button" className="btn btn-sm desktop-only" onClick={() => setSocialOpen(true)}>
              社交预览
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setExportOpen(true)}>
              导出 PNG
            </button>
          </>
        ) : null}
      </header>

      {phase === 'landing' ? (
        <Landing
          health={health}
          healthError={healthError}
          mode={mode}
          onLoaded={handleLoaded}
          onManual={() => setManualOpen(true)}
          busy={busy}
          setBusy={setBusy}
        />
      ) : (
        <>
          <div className="workspace desktop-only">
            <LeftPanel
              design={design.value}
              project={project}
              images={images}
              assets={assets}
              onPatch={patchDesign}
              onSelectImage={(url) => patchDesign({ imageId: url })}
              onUpload={handleUpload}
              onReResolve={handleReResolve}
              onManual={() => setManualOpen(true)}
              reResolving={reResolving}
              warnings={warnings}
            />

            <main className="stage" ref={stageRef}>
              <div className="stage-bar">
                <div className="seg">
                  {RATIO_LIST.map((ratio) => (
                    <button
                      key={ratio.id}
                      type="button"
                      className="seg-item"
                      data-active={design.value.ratio === ratio.id}
                      onClick={() => patchDesign({ ratio: ratio.id as RatioId })}
                      title={ratio.hint}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
                <span className="badge">{TEMPLATE_MAP[design.value.template]?.name}</span>
                <span className="badge">
                  {(() => {
                    const frame = getFrame(design.value.ratio)
                    return `${frame.exportWidth}×${frame.exportHeight}`
                  })()}
                </span>
                <div className="spacer" />
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSocialOpen(true)}>
                  社交预览
                </button>
                <button type="button" className="btn btn-sm" onClick={resetDesign}>
                  重置
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setExportOpen(true)}>
                  导出
                </button>
              </div>
              <div className="stage-viewport">
                <PreviewCanvas
                  design={design.value}
                  project={project}
                  images={images}
                  maxWidth={stageWidth}
                />
              </div>
              <div className="stage-foot">
                <span className="mono">
                  {design.value.template} · {design.value.ratio} · {design.value.font} · 历史 {design.depth} 步
                </span>
                <span>
                  {design.canUndo ? 'Ctrl+Z 撤销' : '改动会实时渲染到画布'} · Ctrl+S 导出
                </span>
              </div>
            </main>

            <RightPanel
              design={design.value}
              project={project}
              images={images}
              onPatch={patchDesign}
              onSelectTemplate={handleSelectTemplate}
              onCopyText={copyAllText}
              copied={copiedText}
            />
          </div>

          <MobileStudio
            design={design.value}
            project={project}
            copy={copy}
            images={images}
            assets={assets}
            warnings={warnings}
            activeTab={mobileTab}
            setActiveTab={setMobileTab}
            onPatch={patchDesign}
            onSelectTemplate={handleSelectTemplate}
            onSelectImage={(url) => patchDesign({ imageId: url })}
            onUpload={handleUpload}
            onExport={() => setExportOpen(true)}
            onSocial={() => setSocialOpen(true)}
            onBack={() => setPhase('landing')}
            onManual={() => setManualOpen(true)}
            onRefreshCopy={handleRefreshCopy}
            refreshing={refreshingCopy}
            canUndo={design.canUndo}
            canRedo={design.canRedo}
            onUndo={design.undo}
            onRedo={design.redo}
            onReset={resetDesign}
          />
        </>
      )}

      <ManualDialog open={manualOpen} onClose={() => setManualOpen(false)} onSubmit={handleManual} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        design={design.value}
        project={project}
        images={images}
      />

      {socialOpen ? (
        <div className="modal-backdrop" onClick={() => setSocialOpen(false)} role="dialog" aria-modal="true">
          <div className="modal" style={{ width: 'min(600px, 100%)' }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">社交平台预览</div>
              <button type="button" className="icon-btn" onClick={() => setSocialOpen(false)} aria-label="关闭">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <SocialPreview
                design={design.value}
                project={project}
                copy={copy}
                thumb={thumb}
                onRefreshCopy={handleRefreshCopy}
                refreshing={refreshingCopy}
                aiEnabled={Boolean(health?.ai.enabled)}
                aiUsed={aiUsed}
                aiError={aiError}
                onCopyTweet={copyTweet}
                copiedTweet={copiedTweet}
                warnings={warnings}
              />
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 26,
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: '#fff',
            padding: '9px 16px',
            borderRadius: 9,
            fontSize: 12.5,
            zIndex: 90,
            boxShadow: 'var(--shadow-lg)',
            maxWidth: '88vw',
          }}
        >
          {toast}
        </div>
      ) : null}

    </div>
  )
}

