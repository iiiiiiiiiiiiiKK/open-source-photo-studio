// 静态部署模式（GitHub Pages / 任意静态托管）的少量辅助函数。
// 实际的抓取逻辑在 browserExtract.ts（浏览器直接调用 GitHub 公开 REST API）。

import type { HealthResponse, ProjectInfo } from '../types'
import { RequestError } from './errors'
import { generateCopy } from '../../shared/copywriter.mjs'

export const STATIC_VIEWPORTS = [
  { key: 'desktop-1280', label: '桌面 1280×800', width: 1280, height: 800 },
  { key: 'mobile-390', label: '手机 390×844', width: 390, height: 844 },
]

export function staticHealth(): HealthResponse {
  return {
    ok: true,
    time: new Date().toISOString(),
    version: '1.0.0-static',
    screenshot: {
      available: false,
      executablePath: null,
      reason:
        '静态版运行在浏览器里，无法启动无头浏览器截图。需要真实截图请使用 Node 服务端模式（npm start 或 Docker）。',
      limits: { timeoutMs: 0, maxHeight: 0, maxWidth: 0, maxConcurrent: 0 },
    },
    ai: { enabled: false, model: null },
    githubToken: false,
    viewports: STATIC_VIEWPORTS,
    cache: { screenshots: { entries: 0, bytes: 0 }, images: { entries: 0, bytes: 0 } },
  }
}

export async function staticRegenerateCopy(project: ProjectInfo) {
  return {
    ok: true as const,
    copy: generateCopy(project),
    ai: { requested: false, used: false, error: '' },
  }
}

export async function staticManualProject(payload: {
  name: string
  description: string
  url: string
  owner: string
  tags: string[]
}) {
  const name = String(payload.name || '').trim()
  if (!name) throw new RequestError('请至少填写项目名称', 'BAD_REQUEST', '')
  const url = String(payload.url || '').trim()
  const project: ProjectInfo = {
    source: 'manual',
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    name,
    fullName: name,
    owner: String(payload.owner || '').trim(),
    description: String(payload.description || '').trim().slice(0, 400),
    repoUrl: /^https?:\/\//.test(url) ? url : '',
    url: /^https?:\/\//.test(url) ? url : '',
    license: '',
    language: '',
    languages: [],
    stars: null,
    forks: null,
    topics: Array.isArray(payload.tags) ? payload.tags.slice(0, 8).map(String) : [],
    readmeRawTruncated: '',
    readmeExcerpt: [],
    readmeImages: [],
    screenshots: [],
    notes: ['手动填写：以下信息由用户提供，未经自动核验。'],
  }
  return { ok: true as const, project, copy: generateCopy(project), warnings: project.notes }
}

export async function staticScreenshot(): Promise<never> {
  throw new RequestError(
    '静态版无法截图',
    'NO_BROWSER',
    '真实网页截图需要服务端无头浏览器。请在本地用 npm start 或 Docker 运行完整版。'
  )
}
