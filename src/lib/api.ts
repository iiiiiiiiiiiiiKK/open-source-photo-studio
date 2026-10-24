// 前端数据层门面：自动在「服务端模式」与「静态模式」之间切换。
//
// - 服务端模式：本地 npm start / Docker / 有 /api 反代的部署（能力完整，含真实截图）
// - 静态模式：GitHub Pages 等纯静态托管（只用浏览器直接调 GitHub 公开接口，不支持截图）
//
// 切换逻辑：启动时探测一次 /api/health。能通就用服务端，不能通就降级到静态模式，
// 并在 UI 上明确告知当前模式能做什么、不能做什么 —— 不静默假装成功。

import type { ApiError, ExtractResponse, GeneratedCopy, HealthResponse, ProjectInfo } from '../types'
import { RequestError } from './errors'
import { staticHealth, staticManualProject, staticRegenerateCopy, staticScreenshot } from './staticApi'
import { extractProjectInBrowser } from './browserExtract'

export { RequestError }

export type AppMode = 'server' | 'static'

/** 强制静态模式（构建 GitHub Pages 版时由 vite 注入） */
const FORCED_STATIC = String(import.meta.env.VITE_STATIC_MODE || '') === '1'

let cachedMode: AppMode | null = null
let healthPromise: Promise<HealthResponse> | null = null

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new RequestError('服务端返回了无法解析的内容', 'BAD_RESPONSE', '', res.status)
  }
  if (!res.ok) {
    const err = data as ApiError | null
    throw new RequestError(err?.message || `请求失败（${res.status}）`, err?.error || 'REQUEST_FAILED', err?.hint || '', res.status)
  }
  return data as T
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new RequestError('请求已取消', 'ABORTED')
    }
    throw new RequestError(
      '无法连接到服务端，请确认 API 服务已启动（npm run dev 或 npm start）',
      'NETWORK_DOWN',
      '前后端分离部署时，请把 /api 反向代理到 Node 服务。'
    )
  }
  return parse<T>(res)
}

/** 探测运行模式（只探测一次） */
export async function detectMode(): Promise<AppMode> {
  if (FORCED_STATIC) {
    cachedMode = 'static'
    return 'static'
  }
  if (cachedMode) return cachedMode
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('/api/health', { signal: controller.signal })
    clearTimeout(timer)
    cachedMode = res.ok ? 'server' : 'static'
  } catch {
    cachedMode = 'static'
  }
  return cachedMode
}

export function getCachedMode(): AppMode | null {
  return cachedMode
}

/** 健康检查：服务端模式走接口，静态模式返回内置说明 */
export async function getHealth(): Promise<HealthResponse> {
  if (healthPromise) return healthPromise
  healthPromise = (async () => {
    const mode = await detectMode()
    if (mode === 'static') return staticHealth()
    try {
      const res = await fetch('/api/health')
      return await parse<HealthResponse>(res)
    } catch {
      cachedMode = 'static'
      return staticHealth()
    }
  })()
  return healthPromise
}

export interface ExtractPayload {
  url: string
  ai?: boolean
  withScreenshot?: boolean
  viewport?: string
}

export async function extractProject(payload: ExtractPayload, signal?: AbortSignal): Promise<ExtractResponse> {
  const mode = await detectMode()
  if (mode === 'static') return extractProjectInBrowser(payload, signal)
  return post<ExtractResponse>('/api/extract', payload, signal)
}

export function regenerateCopy(project: ProjectInfo, ai: boolean) {
  return (async () => {
    const mode = await detectMode()
    if (mode === 'static') return staticRegenerateCopy(project)
    return post<{ ok: true; copy: GeneratedCopy; ai: { requested: boolean; used: boolean; error: string } }>(
      '/api/copy',
      { project, ai }
    )
  })()
}

export function buildManualProject(payload: { name: string; description: string; url: string; owner: string; tags: string[] }) {
  return (async () => {
    const mode = await detectMode()
    if (mode === 'static') return staticManualProject(payload)
    return post<{ ok: true; project: ProjectInfo; copy: GeneratedCopy; warnings: string[] }>('/api/manual', payload)
  })()
}

export async function takeScreenshot(url: string, viewport: string) {
  const mode = await detectMode()
  if (mode === 'static') return staticScreenshot()
  return post<{
    ok: true
    id: string
    width: number
    height: number
    finalUrl: string
    title: string
    blocked: { url: string; reason: string }[]
    url: string
  }>('/api/screenshot', { url, viewport })
}
