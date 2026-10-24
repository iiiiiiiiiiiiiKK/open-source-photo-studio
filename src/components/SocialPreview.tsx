import { useMemo } from 'react'
import type { DesignState, ExtractResponse, GeneratedCopy, ProjectInfo } from '../types'
import { RATIO_LIST } from '../render/geometry'

interface Props {
  design: DesignState
  project: ProjectInfo | null
  copy: GeneratedCopy | null
  thumb: string | null
  onRefreshCopy: () => void
  refreshing: boolean
  aiEnabled: boolean
  aiUsed: boolean
  aiError: string
  onCopyTweet: () => void
  copiedTweet: boolean
  warnings: string[]
}

/** 社交平台预览：模拟 X / 微博信息流的实际观感 */
export function SocialPreview({
  design,
  project,
  copy,
  thumb,
  onRefreshCopy,
  refreshing,
  aiEnabled,
  aiUsed,
  aiError,
  onCopyTweet,
  copiedTweet,
  warnings,
}: Props) {
  const tweet = copy?.tweet || ''
  const displayName = project?.fullName || project?.title || design.title

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="preview-pane">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 12.5 }}>在 X 信息流里的样子</strong>
          <span className="badge">{design.ratio}</span>
        </div>
        <div className="social-mock" style={{ background: '#000', color: '#e7e9ea', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="avatar-dot" style={{ background: '#333' }}>
              {(displayName || 'P').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>{displayName}</div>
              <div style={{ fontSize: 12, color: '#71767b' }}>@{project?.owner || 'project'} · 刚刚</div>
            </div>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, color: '#e7e9ea' }}>
            {tweet || design.oneLiner || '在这里会显示你生成的 X 短文案。'}
          </div>
          {thumb ? <img src={thumb} alt="分享图预览" /> : <div className="skeleton" style={{ height: 160 }} />}
          <div style={{ display: 'flex', gap: 24, fontSize: 11.5, color: '#71767b' }}>
            <span>♡ 0</span>
            <span>↺ 0</span>
            <span>✎ 0</span>
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={onCopyTweet} disabled={!tweet}>
          {copiedTweet ? '已复制 X 文案' : '复制 X 短文案'}
        </button>
      </div>

      <div className="preview-pane">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 12.5 }}>中文社交卡片观感</strong>
          <span className="badge">{design.ratio}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: 4 }}>
          <div className="avatar-dot">{project?.source === 'github' ? 'G' : 'W'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650 }}>{displayName}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 2 }}>
              {design.oneLiner || '一句话介绍会显示在这里'}
            </div>
            {thumb ? (
              <img src={thumb} alt="卡片预览" style={{ width: '100%', borderRadius: 6, marginTop: 8, display: 'block' }} />
            ) : null}
          </div>
        </div>
      </div>

      <div className="preview-pane">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 12.5 }}>文案来源</strong>
          <button type="button" className="btn btn-sm" onClick={onRefreshCopy} disabled={refreshing}>
            {refreshing ? '生成中…' : aiEnabled ? '重新生成（可含 AI）' : '重新生成文案'}
          </button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, fontSize: 11.5 }}>
          <span className={copy?.mode === 'ai' ? 'badge badge-ok' : 'badge'}>
            {copy?.mode === 'ai' ? `AI · ${copy.aiModel || ''}` : copy?.mode === 'manual' ? '手动' : '本地规则生成'}
          </span>
          {!aiEnabled ? <span className="badge">未配置 API Key</span> : null}
          {aiUsed ? <span className="badge badge-ok">已用 AI</span> : null}
        </div>
        {aiError ? (
          <div className="status-line" data-tone={warnTone(aiError)} style={{ fontSize: 11.5 }}>
            {aiError}
          </div>
        ) : null}
        {copy?.facts?.length ? (
          <div className="stack" style={{ gap: 4 }}>
            <div className="panel-title" style={{ fontSize: 10.5 }}>
              原始资料（可核对）
            </div>
            {copy.facts.slice(0, 6).map((fact) => (
              <div key={`${fact.label}-${fact.value}`} style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{fact.label}：</span>
                {fact.value}
                <span className="mono" style={{ opacity: 0.7 }}> 〔{fact.source}〕</span>
              </div>
            ))}
          </div>
        ) : null}
        {warnings.length ? (
          <div className="stack" style={{ gap: 4 }}>
            <div className="panel-title" style={{ fontSize: 10.5 }}>
              抓取提示
            </div>
            {warnings.map((warning) => (
              <div key={warning} style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                · {warning}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function warnTone(message: string): 'info' | 'warn' {
  return /未配置|未生效|失败|回退/.test(message) ? 'warn' : 'info'
}
