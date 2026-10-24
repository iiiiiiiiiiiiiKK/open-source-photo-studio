import { useState } from 'react'
import type { ProjectInfo } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (payload: { name: string; description: string; url: string; owner: string; tags: string[]; highlights: string[] }) => Promise<void>
}

/** 手动模式：完全离线，不依赖任何接口，保证任何时候都能做出图。 */
export function ManualDialog({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [owner, setOwner] = useState('')
  const [tags, setTags] = useState('')
  const [highlights, setHighlights] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function submit() {
    if (!name.trim()) {
      setError('请填写项目名称')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        url: url.trim(),
        owner: owner.trim(),
        tags: tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 8),
        highlights: highlights
          .split('\n')
          .map((h) => h.trim())
          .filter(Boolean)
          .slice(0, 5),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">手动填写项目信息</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="status-line">
            手动模式不会访问任何网站，适合内网项目、私有仓库，或接口暂时不可用的情况。之后仍可点"重新读取"补充真实数据。
          </div>
          <div className="field">
            <div className="field-label">项目名称 *</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：my-awesome-lib" maxLength={80} />
          </div>
          <div className="field">
            <div className="field-label">一句话描述</div>
            <textarea
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这是一个用来……的工具，帮助……"
              maxLength={280}
              rows={3}
            />
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <div className="field-label">作者 / 组织</div>
              <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="owner" maxLength={40} />
            </div>
            <div className="field" style={{ flex: 1.4 }}>
              <div className="field-label">项目地址</div>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div className="field">
            <div className="field-label">标签（逗号或空格分隔）</div>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="typescript, cli, devtools" />
          </div>
          <div className="field">
            <div className="field-label">亮点（每行一条，留空则自动留白）</div>
            <textarea
              className="textarea"
              value={highlights}
              onChange={(e) => setHighlights(e.target.value)}
              placeholder={'零配置启动\n支持增量构建\n单文件产物'}
              rows={3}
            />
          </div>
          {error ? (
            <div className="status-line" data-tone="err">
              {error}
            </div>
          ) : null}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? '创建中…' : '进入工作台'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <div className="spacer" />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>不会写入任何服务器数据</span>
        </div>
      </div>
    </div>
  )
}

export function manualToProject(payload: { name: string; description: string; url: string; owner: string; tags: string[] }, project: ProjectInfo): ProjectInfo {
  return project
}
