// 浏览器端提取：静态部署时，普通网站无法抓取（跨域），
// 但 GitHub 仓库可以通过公开 REST API 完整读取。
import type { ExtractResponse, ProjectInfo, ScreenshotAsset } from '../types'
import { RequestError } from './errors'
import { assembleGitHubProject, isGitHubRepoUrl, parseGitHubUrl } from '../../shared/github-parse.mjs'
import { generateCopy } from '../../shared/copywriter.mjs'

const API = 'https://api.github.com'

async function ghJson(path: string, optional = false): Promise<any> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    })
  } catch {
    throw new RequestError(
      '浏览器无法访问 GitHub 接口（网络被拦截或离线）',
      'NETWORK_DOWN',
      '请检查网络，或改用本地 Node 服务端模式。'
    )
  }
  if (res.status === 404 && optional) return null
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    throw new RequestError(
      remaining === '0' ? 'GitHub 匿名接口配额已用完（每小时 60 次）' : 'GitHub 拒绝了这次访问（可能触发了限流）',
      'RATE_LIMIT',
      '静态版直接调用 GitHub 公开接口，配额按你的 IP 计算。稍后重试，或改用本地服务端模式（可配 Token）。'
    )
  }
  if (!res.ok) {
    throw new RequestError(`GitHub 接口返回 ${res.status}`, 'UPSTREAM_STATUS', '请稍后重试。')
  }
  return res.json()
}

async function ghRaw(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { accept: 'application/vnd.github.raw' } })
    return res.ok ? res.text() : null
  } catch {
    return null
  }
}

export async function extractProjectInBrowser(
  payload: { url: string; withScreenshot?: boolean; ai?: boolean },
  signal?: AbortSignal
): Promise<ExtractResponse> {
  const started = Date.now()
  const raw = String(payload.url || '').trim()
  if (!raw) throw new RequestError('请先输入 GitHub 仓库地址', 'URL_INVALID')
  let normalized = raw
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) normalized = `https://${normalized}`

  if (signal?.aborted) throw new RequestError('请求已取消', 'ABORTED')

  if (!isGitHubRepoUrl(normalized)) {
    throw new RequestError(
      '当前是 GitHub Pages 静态版，只能直接读取 GitHub 仓库地址',
      'STATIC_LIMIT_SITE',
      '浏览器跨域限制导致无法读取任意网站的 meta 信息。可以：① 换成该项目的 GitHub 仓库地址；② 点「手动填写项目信息」自己写；③ 本地运行 Node 服务端模式（npm start / Docker）获得完整能力。'
    )
  }

  const parsed = parseGitHubUrl(normalized)!
  let repo: any
  try {
    repo = await ghJson(`/repos/${parsed.fullName}`)
  } catch (error) {
    if (error instanceof RequestError && error.code === 'UPSTREAM_STATUS') {
      throw new RequestError(
        `找不到仓库 ${parsed.fullName}，可能地址写错或它是私有仓库`,
        'REPO_NOT_FOUND',
        '请确认仓库是公开的。'
      )
    }
    throw error
  }

  const [languages, readme, release] = await Promise.all([
    ghJson(`/repos/${parsed.fullName}/languages`, true).catch(() => null),
    ghRaw(`/repos/${parsed.fullName}/readme`),
    ghJson(`/repos/${parsed.fullName}/releases/latest`, true).catch(() => null),
  ])

  const project: ProjectInfo = assembleGitHubProject(repo, {
    languages,
    readme,
    release,
    sourceUrl: parsed.url,
  })

  const screenshots: ScreenshotAsset[] = []
  for (const image of (project.readmeImages || []).slice(0, 6)) {
    screenshots.push({ url: image, kind: 'readme', label: 'README 图片' })
  }
  if (project.socialPreview) {
    screenshots.push({ url: project.socialPreview, kind: 'og', label: 'GitHub 社交预览图' })
  }
  project.screenshots = screenshots

  return {
    ok: true,
    elapsedMs: Date.now() - started,
    project,
    copy: generateCopy(project),
    screenshots,
    shot: null,
    warnings: [
      '这是静态部署版（GitHub Pages）：元信息与 README 图片可以正常读取，但真实网页截图不可用（需要服务端无头浏览器）。',
    ],
    ai: { requested: false, used: false, error: '' },
    screenshotCapability: {
      available: false,
      executablePath: null,
      reason: '静态版没有服务端，无法启动无头浏览器。完整截图能力请使用 npm start 或 Docker。',
      limits: { timeoutMs: 0, maxHeight: 0, maxWidth: 0, maxConcurrent: 0 },
    },
  }
}
