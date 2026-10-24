import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExtractResponse, HealthResponse, ProjectInfo, RatioId, TemplateId } from '../types'
import { extractProject, getHealth, detectMode, type AppMode, type ExtractPayload } from '../lib/api'
import { RequestError } from '../lib/api'

const EXAMPLES = [
  { label: 'facebook/react', url: 'https://github.com/facebook/react', kind: 'GitHub' },
  { label: 'tailwindlabs/tailwindcss', url: 'https://github.com/tailwindlabs/tailwindcss', kind: 'GitHub' },
  { label: 'vitejs/vite', url: 'https://github.com/vitejs/vite', kind: 'GitHub' },
  { label: 'example.com', url: 'https://example.com', kind: '官网' },
  { label: 'react.dev', url: 'https://react.dev', kind: '官网' },
]

const VIEWPORT_OPTIONS = [
  { value: 'desktop-1280', label: '桌面 1280×800' },
  { value: 'desktop-1440', label: '桌面 1440×900' },
  { value: 'laptop-1024', label: '笔记本 1024×768' },
  { value: 'mobile-390', label: '手机 390×844' },
  { value: 'tablet-768', label: '平板 768×1024' },
]

interface Props {
  health: HealthResponse | null
  healthError: string
  mode?: AppMode | null
  onLoaded: (payload: ExtractResponse, meta: { template?: TemplateId; ratio?: RatioId }) => void
  onManual: () => void
  busy: boolean
  setBusy: (next: boolean) => void
}

export function Landing({ health, healthError, mode, onLoaded, onManual, busy, setBusy }: Props) {
  const [url, setUrl] = useState('')
  const [ai, setAi] = useState(false)
  const [withScreenshot, setWithScreenshot] = useState(true)
  const [viewport, setViewport] = useState('desktop-1280')
  const [error, setError] = useState<{ message: string; hint: string; code: string } | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const shotReady = health?.screenshot.available ?? false
  const aiReady = health?.ai.enabled ?? false

  async function submit(target?: string) {
    const value = (target ?? url).trim()
    if (!value) {
      setError({ message: '请先输入 GitHub 仓库地址或项目官网', hint: '', code: 'EMPTY' })
      inputRef.current?.focus()
      return
    }
    setError(null)
    setWarnings([])
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const payload: ExtractPayload = {
        url: value,
        ai: ai && aiReady,
        withScreenshot: withScreenshot && shotReady,
        viewport,
      }
      const result = await extractProject(payload, controller.signal)
      setUrl(value)
      setWarnings(result.warnings || [])
      onLoaded(result, {})
      if (result.warnings?.length) {
        // 保留提示但已经进入工作台
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      if (err instanceof RequestError) {
        setError({ message: err.message, hint: err.hint, code: err.code })
      } else {
        setError({ message: (err as Error)?.message || '提取失败', hint: '', code: 'UNKNOWN' })
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  function cancel() {
    abortRef.current?.abort()
    setBusy(false)
  }

  return (
    <div className="landing">
      <div className="landing-inner">
        <div className="landing-hero">
          <div className="landing-eyebrow">
            Open Source Photo Studio
            {mode === 'static' ? <span className="badge" style={{ marginLeft: 8 }}>静态版</span> : null}
          </div>
          <h1 className="landing-title">
            把开源项目
            <br />
            拍成一张能发出去的图
          </h1>
          <p className="landing-lede">
            {mode === 'static'
              ? '输入 GitHub 仓库地址，直接读取真实元信息、生成中文介绍与亮点，套用六种模板导出 16:9 / 1:1 / 3:4 的高清 PNG。静态版没有服务端，真实网页截图不可用；手动填写与本地图片排版完全可用。'
              : '输入 GitHub 仓库或项目官网，自动读取真实元信息、生成中文介绍与亮点，套用六种模板导出 16:9 / 1:1 / 3:4 的高清 PNG。没有 API Key 也能完整使用，所有文案都可以手动改。'}
          </p>
        </div>

        <div className="input-card">
          <div className="url-row">
            <input
              ref={inputRef}
              className="input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://github.com/owner/repo  或  https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
              disabled={busy}
              aria-label="项目地址"
            />
            {busy ? (
              <button type="button" className="btn" onClick={cancel}>
                取消
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => submit()}>
                读取项目
              </button>
            )}
          </div>

          <div className="examples">
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>试试：</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.url}
                type="button"
                className="example-chip"
                onClick={() => {
                  setUrl(example.url)
                  submit(example.url)
                }}
                disabled={busy}
              >
                <span className="mono" style={{ fontSize: 11 }}>
                  {example.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{example.kind}</span>
              </button>
            ))}
          </div>

          <div className="divider" style={{ margin: '2px 0' }} />

          <div className="option-row">
            <label className="option-label" title={shotReady ? '使用服务端 Chrome 截取真实页面' : health?.screenshot.reason}>
              <span className="switch" data-on={withScreenshot && shotReady} aria-hidden />
              <input
                type="checkbox"
                checked={withScreenshot && shotReady}
                onChange={(event) => setWithScreenshot(event.target.checked)}
                disabled={!shotReady}
                style={{ display: 'none' }}
              />
              真实网页截图
              {!shotReady ? <span className="badge badge-warn">不可用</span> : null}
            </label>

            <select
              className="select"
              style={{ width: 'auto', height: 30, padding: '0 8px', fontSize: 12.5 }}
              value={viewport}
              onChange={(event) => setViewport(event.target.value)}
              disabled={!shotReady}
              aria-label="截图视口"
            >
              {VIEWPORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="option-label" title={aiReady ? `使用 ${health?.ai.model}` : '服务端未配置 AI_API_KEY'}>
              <span className="switch" data-on={ai && aiReady} aria-hidden />
              <input
                type="checkbox"
                checked={ai && aiReady}
                onChange={(event) => setAi(event.target.checked)}
                disabled={!aiReady}
                style={{ display: 'none' }}
              />
              AI 润色
              {!aiReady ? <span className="badge">无 Key 也可用</span> : null}
            </label>

            <div className="spacer" />

            <button type="button" className="btn btn-ghost btn-sm" onClick={onManual} disabled={busy}>
              手动填写项目信息
            </button>
          </div>

          {error ? (
            <div className="status-line" data-tone="err">
              <strong>读取失败</strong>
              <span>{error.message}</span>
              {error.hint ? <span style={{ color: 'inherit', opacity: 0.8 }}>· {error.hint}</span> : null}
            </div>
          ) : null}

          {warnings.length ? (
            <div className="notice-list">
              {warnings.map((warning) => (
                <div key={warning} className="status-line" data-tone="warn">
                  {warning}
                </div>
              ))}
            </div>
          ) : null}

          {busy ? (
            <div className="status-line">
              <span className="spin" style={{ display: 'inline-block' }}>
                ◐
              </span>
              正在读取项目信息{withScreenshot && shotReady ? '并启动无头浏览器截图' : ''}，通常需要 3–20 秒…
            </div>
          ) : null}

          {healthError ? (
            <div className="status-line" data-tone="err">
              服务端未连接：{healthError}。请先运行 <code className="mono">npm run dev</code> 或{' '}
              <code className="mono">npm start</code>。
            </div>
          ) : null}

          {health ? (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, fontSize: 11.5, color: 'var(--muted)' }}>
              <span className={health.screenshot.available ? 'badge badge-ok' : 'badge badge-err'}>
                截图引擎 {health.screenshot.available ? '就绪' : '不可用'}
              </span>
              <span className={health.githubToken ? 'badge badge-ok' : 'badge'}>
                GitHub {health.githubToken ? '已配置 Token' : '匿名 60 次/小时'}
              </span>
              <span className={health.ai.enabled ? 'badge badge-ok' : 'badge'}>
                AI {health.ai.enabled ? health.ai.model : '未配置（本地文案可用）'}
              </span>
              {health.screenshot.available && health.screenshot.executablePath ? (
                <span className="mono" style={{ fontSize: 10.5, opacity: 0.75 }}>
                  {health.screenshot.executablePath.split(/[\\/]/).pop()}
                </span>
              ) : null}
            </div>
          ) : null}

          {health && !health.screenshot.available ? (
            <div className="status-line" data-tone="warn">
              <strong>当前是静态部署版</strong>
              <span>
                {health.screenshot.reason} 也可以直接用手动填写项目信息，或用本地图片完成排版与导出。
              </span>
            </div>
          ) : null}
        </div>

        <div className="feature-grid">
          <div className="feature-cell">
            <strong>{health?.screenshot.available ? '真实截图，不是占位图' : 'GitHub 元信息直连读取'}</strong>
            <span>
              {health?.screenshot.available
                ? '服务端 Playwright + 本机 Chrome 渲染，SSRF 拦截内网与本地地址'
                : '静态版直接调用 GitHub 公开接口，Star / 语言 / README 均为真实数据'}
            </span>
          </div>
          <div className="feature-cell">
            <strong>六种排版，三种比例</strong>
            <span>卡片 / 终端 / 编辑部 / 海报 / 拼贴 / 架构图，全部用 Canvas 绘制</span>
          </div>
          <div className="feature-cell">
            <strong>不编数据</strong>
            <span>缺失指标显示"未知"，文案可追溯到 API 字段</span>
          </div>
          <div className="feature-cell">
            <strong>导出即所得</strong>
            <span>预览与导出共用渲染器，PNG 2x 输出，无 DOM 截图误差</span>
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
          提示：本工具只使用公开信息，不绕过登录、付费墙或访问限制。截图与元信息版权归原项目所有，发布前请自行核对。
        </p>
      </div>
    </div>
  )
}

export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<AppMode | null>(null)

  useEffect(() => {
    let alive = true
    detectMode()
      .then((detected) => {
        if (alive) setMode(detected)
      })
      .catch(() => {
        if (alive) setMode('static')
      })
    getHealth()
      .then((data) => {
        if (alive) setHealth(data)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '连接失败')
      })
    return () => {
      alive = false
    }
  }, [])
  return { health, error, mode }
}

export function summarizeProject(project: ProjectInfo): string {
  return project.fullName || project.title || project.name || project.host || ''
}
