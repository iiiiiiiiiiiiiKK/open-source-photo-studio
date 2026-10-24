// GitHub 元信息抓取：只使用公开 REST API（可选 GITHUB_TOKEN 提高配额）。
// 所有网络请求都走 safeFetch（DNS + IP 校验 + 跳转次数限制 + 大小限制）。
import { safeFetch, HttpError } from './http.mjs'

const API = 'https://api.github.com'

export class GitHubError extends Error {
  constructor(message, code, hint) {
    super(message)
    this.name = 'GitHubError'
    this.code = code || 'GITHUB_ERROR'
    this.hint = hint || ''
  }
}

/** 从各种 GitHub 网址形式中解析 owner/repo */
export function parseGitHubUrl(raw) {
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'github.com' && host !== 'raw.githubusercontent.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null
  return { owner, repo, fullName: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}` }
}

/** 判断一个网址是不是本工具理解的 GitHub 仓库地址 */
export function isGitHubRepoUrl(raw) {
  const parsed = parseGitHubUrl(raw)
  if (!parsed) return false
  // 排除 github.com/features 之类站点页面
  const reserved = new Set([
    'features', 'topics', 'collections', 'sponsors', 'marketplace', 'about', 'pricing',
    'login', 'join', 'settings', 'notifications', 'explore', 'trending', 'new', 'orgs',
    'users', 'apps', 'site', 'contact', 'security', 'enterprise', 'readme', 'search',
  ])
  return !reserved.has(parsed.owner.toLowerCase())
}

function apiHeaders() {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

function explainStatus(status, res, fullName) {
  const remaining = res?.headers?.['x-ratelimit-remaining']
  if (status === 404) {
    return new GitHubError(
      `找不到仓库 ${fullName}，可能是地址写错了，或者它是私有仓库`,
      'REPO_NOT_FOUND',
      '请确认仓库是公开的，或在手动模式下自己填写项目信息。'
    )
  }
  if (status === 403 || status === 429) {
    if (String(remaining) === '0') {
      return new GitHubError(
        'GitHub 公开接口的匿名调用配额已用完（每小时 60 次）',
        'RATE_LIMIT',
        '可以稍后再试，或在服务端配置 GITHUB_TOKEN 提高配额；也可以直接用手动模式填写项目信息。'
      )
    }
    return new GitHubError(
      'GitHub 拒绝了这次访问（可能触发了限流）',
      'RATE_LIMIT',
      '请稍后重试，或使用手动模式。'
    )
  }
  if (status === 401) {
    return new GitHubError('GitHub 令牌无效', 'BAD_TOKEN', '请检查服务端 GITHUB_TOKEN 配置。')
  }
  return new GitHubError(`GitHub 接口返回 ${status}`, 'UPSTREAM_STATUS', '请稍后重试。')
}

async function ghJson(path, { optional = false } = {}) {
  try {
    const res = await safeGh(`${API}${path}`)
    if (res.status === 404 && optional) return null
    if (res.status < 200 || res.status >= 300) throw explainStatus(res.status, res, path)
    return JSON.parse(res.body.toString('utf8'))
  } catch (error) {
    if (optional) return null
    throw normalizeGhError(error)
  }
}

async function ghText(path, { optional = false } = {}) {
  try {
    const res = await safeGh(`${API}${path}`, { accept: 'application/vnd.github.raw' })
    if (res.status === 404 && optional) return null
    if (res.status < 200 || res.status >= 300) throw explainStatus(res.status, res, path)
    return res.body.toString('utf8')
  } catch (error) {
    if (optional) return null
    throw normalizeGhError(error)
  }
}

async function safeGh(url, extraHeaders = {}) {
  return safeFetch(url, {
    headers: { ...apiHeaders(), ...extraHeaders },
    timeoutMs: 15000,
    maxBytes: 6 * 1024 * 1024,
    maxRedirects: 2,
  })
}

function normalizeGhError(error) {
  if (error instanceof GitHubError) return error
  if (error instanceof HttpError) {
    if (error.code === 'TIMEOUT') return new GitHubError('访问 GitHub 超时', 'TIMEOUT', '请检查网络后重试。')
    if (error.code === 'DNS_FAILED') return new GitHubError('无法解析 api.github.com', 'DNS_FAILED', '请检查服务器网络。')
    return new GitHubError(`访问 GitHub 失败：${error.message}`, error.code, '请稍后重试，或使用手动模式。')
  }
  return new GitHubError(error?.message || '访问 GitHub 失败', 'GITHUB_ERROR', '请稍后重试。')
}

/** 从 README Markdown / HTML 中提取图片地址 */
export function extractReadmeImages(markdown, baseUrl) {
  const images = []
  const push = (src) => {
    if (!src) return
    const cleaned = src.trim().replace(/^<|>$/g, '')
    if (!cleaned || cleaned.startsWith('data:')) return
    if (/\.(svg)(\?|#|$)/i.test(cleaned)) return
    // 过滤徽章（shields.io / badge / badge 类图片）
    if (/img\.shields\.io|badge|badgen\.net|travis-ci|circleci|codecov|coveralls|snyk\.io/i.test(cleaned)) return
    let absolute
    try {
      absolute = new URL(cleaned, baseUrl).href
    } catch {
      return
    }
    if (!/^https?:/i.test(absolute)) return
    if (!images.includes(absolute)) images.push(absolute)
  }

  const mdImage = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g
  let m
  while ((m = mdImage.exec(markdown))) push(m[1])

  const htmlImage = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi
  while ((m = htmlImage.exec(markdown))) push(m[1])

  const linkImage = /\[!\[[^\]]*\]\(([^)]+)\)\]/g
  while ((m = linkImage.exec(markdown))) push(m[1])

  return images.slice(0, 12)
}

/** README 转成纯文本摘要（去掉徽章、代码块、HTML 标签） */
export function readmeToPlain(markdown, limit = 6000) {
  let text = markdown || ''
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/<img[^>]*>/gi, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  text = text.replace(/^\s*\|.*\|\s*$/gm, ' ')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim().slice(0, limit)
}

/** 取 README 的前几段作为"项目是怎么介绍自己的"证据 */
export function readmeLeadParagraphs(markdown, count = 3) {
  const plain = readmeToPlain(markdown, 4000)
  const lines = plain.split('\n').map((l) => l.trim())
  const paragraphs = []
  for (const line of lines) {
    if (!line) continue
    if (/^[#=\-*_]{2,}$/.test(line)) continue
    if (/^\[?!\[/.test(line)) continue
    if (/^[\u4e00-\u9fa5]?.{0,80}$/.test(line) && line.length < 12 && !/[.。!！?？]/.test(line)) continue
    paragraphs.push(line)
    if (paragraphs.length >= count) break
  }
  return paragraphs
}

/**
 * 主入口：抓取 GitHub 仓库元信息。
 * 返回结构化 ProjectInfo（不含生成文案）。
 */
export async function fetchGitHubProject(rawUrl, { includeReadme = true } = {}) {
  const parsed = parseGitHubUrl(rawUrl)
  if (!parsed) {
    throw new GitHubError('这不是一个 GitHub 仓库地址，格式应类似 https://github.com/owner/repo', 'NOT_GITHUB_URL')
  }
  const repo = await ghJson(`/repos/${parsed.fullName}`)
  const fullName = repo.full_name || parsed.fullName
  const branch = repo.default_branch || 'main'

  const [languages, readme, releases] = await Promise.all([
    ghJson(`/repos/${fullName}/languages`, { optional: true }).catch(() => null),
    includeReadme ? ghText(`/repos/${fullName}/readme`, { optional: true }).catch(() => null) : null,
    ghJson(`/repos/${fullName}/releases/latest`, { optional: true }).catch(() => null),
  ])

  const baseForImages = `https://raw.githubusercontent.com/${fullName}/${branch}/`
  const readmeImages = readme ? extractReadmeImages(readme, baseForImages) : []

  const languageEntries = languages
    ? Object.entries(languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, bytes]) => ({ name, bytes }))
    : []
  const totalBytes = languageEntries.reduce((sum, item) => sum + item.bytes, 0) || 1

  const homepage = (repo.homepage || '').trim()
  const homepageUrl = /^https?:\/\//i.test(homepage) ? homepage : ''

  return {
    source: 'github',
    sourceUrl: parsed.url,
    fetchedAt: new Date().toISOString(),
    name: repo.name || parsed.repo,
    fullName,
    owner: repo.owner?.login || parsed.owner,
    ownerAvatar: repo.owner?.avatar_url || '',
    ownerType: repo.owner?.type || '',
    description: repo.description || '',
    homepage: homepageUrl,
    repoUrl: parsed.url,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : repo.license?.name || '',
    licenseName: repo.license?.name || '',
    language: repo.language || '',
    languages: languageEntries.map((item) => ({
      name: item.name,
      percent: Math.round((item.bytes / totalBytes) * 1000) / 10,
    })),
    stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : null,
    forks: typeof repo.forks_count === 'number' ? repo.forks_count : null,
    issues: typeof repo.open_issues_count === 'number' ? repo.open_issues_count : null,
    watchers: typeof repo.subscribers_count === 'number' ? repo.subscribers_count : null,
    topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 12) : [],
    createdAt: repo.created_at || '',
    pushedAt: repo.pushed_at || '',
    archived: Boolean(repo.archived),
    isFork: Boolean(repo.fork),
    defaultBranch: branch,
    latestRelease: releases
      ? { tag: releases.tag_name || '', name: releases.name || '', publishedAt: releases.published_at || '' }
      : null,
    readmeImages,
    readmeExcerpt: readme ? readmeLeadParagraphs(readme) : [],
    readmeRawTruncated: readme ? readme.slice(0, 20000) : '',
    socialPreview: `https://opengraph.githubassets.com/1/${fullName}`,
    screenshots: [],
    notes: [],
  }
}
