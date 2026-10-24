// GitHub 网址解析与 README 处理 —— 纯函数，不访问网络。
// 服务端（Node）与浏览器（静态部署模式）共用同一份逻辑，保证两端产出的数据结构完全一致。

/** 从各种 GitHub 网址形式中解析 owner/repo */
export function parseGitHubUrl(raw) {
  let url
  try {
    url = new URL(String(raw).trim())
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

const RESERVED_OWNERS = new Set([
  'features', 'topics', 'collections', 'sponsors', 'marketplace', 'about', 'pricing',
  'login', 'join', 'settings', 'notifications', 'explore', 'trending', 'new', 'orgs',
  'users', 'apps', 'site', 'contact', 'security', 'enterprise', 'readme', 'search',
])

/** 判断一个网址是不是本工具理解的 GitHub 仓库地址 */
export function isGitHubRepoUrl(raw) {
  const parsed = parseGitHubUrl(raw)
  if (!parsed) return false
  return !RESERVED_OWNERS.has(parsed.owner.toLowerCase())
}

/** 从 README Markdown / HTML 中提取图片地址（过滤徽章与 SVG） */
export function extractReadmeImages(markdown, baseUrl) {
  const images = []
  const push = (src) => {
    if (!src) return
    const cleaned = String(src).trim().replace(/^<|>$/g, '')
    if (!cleaned || cleaned.startsWith('data:')) return
    if (/\.svg(\?|#|$)/i.test(cleaned)) return
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

  const pictureSource = /<source[^>]+srcset\s*=\s*["']([^"'\s]+)/gi
  while ((m = pictureSource.exec(markdown))) push(m[1])

  return images.slice(0, 12)
}

/** README 转成纯文本摘要（去掉徽章、代码块、HTML 标签） */
export function readmeToPlain(markdown, limit = 6000) {
  let text = String(markdown || '')
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
  const lines = plain.split('\n').map((line) => line.trim())
  const paragraphs = []
  for (const line of lines) {
    if (!line) continue
    if (/^[#=\-*_]{2,}$/.test(line)) continue
    if (/^\[?!\[/.test(line)) continue
    if (line.length < 12 && !/[.。!！?？]/.test(line)) continue
    paragraphs.push(line)
    if (paragraphs.length >= count) break
  }
  return paragraphs
}

/**
 * 把 GitHub REST API 的原始响应组装成本项目的 ProjectInfo 结构。
 * @param {object} repo       GET /repos/:owner/:repo 的响应
 * @param {object} extras     { languages, readme, release, sourceUrl }
 */
export function assembleGitHubProject(repo, extras = {}) {
  const { languages = null, readme = null, release = null, sourceUrl = '' } = extras
  const fullName = repo.full_name || ''
  const branch = repo.default_branch || 'main'
  const parsed = parseGitHubUrl(sourceUrl) || parseGitHubUrl(`https://github.com/${fullName}`)

  const baseForImages = `https://raw.githubusercontent.com/${fullName}/${branch}/`
  const readmeImages = readme ? extractReadmeImages(readme, baseForImages) : []

  const languageEntries = languages
    ? Object.entries(languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, bytes]) => ({ name, bytes }))
    : []
  const totalBytes = languageEntries.reduce((sum, item) => sum + item.bytes, 0) || 1

  const homepage = String(repo.homepage || '').trim()
  const homepageUrl = /^https?:\/\//i.test(homepage) ? homepage : ''

  return {
    source: 'github',
    sourceUrl: parsed?.url || sourceUrl,
    fetchedAt: new Date().toISOString(),
    name: repo.name || parsed?.repo || '',
    fullName,
    owner: repo.owner?.login || parsed?.owner || '',
    ownerAvatar: repo.owner?.avatar_url || '',
    ownerType: repo.owner?.type || '',
    description: repo.description || '',
    homepage: homepageUrl,
    repoUrl: parsed?.url || `https://github.com/${fullName}`,
    license:
      repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
        ? repo.license.spdx_id
        : repo.license?.name || '',
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
    latestRelease: release
      ? { tag: release.tag_name || '', name: release.name || '', publishedAt: release.published_at || '' }
      : null,
    readmeImages,
    readmeExcerpt: readme ? readmeLeadParagraphs(readme) : [],
    readmeRawTruncated: readme ? readme.slice(0, 20000) : '',
    socialPreview: `https://opengraph.githubassets.com/1/${fullName}`,
    screenshots: [],
    notes: [],
  }
}
