import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { assertUrlSafe, describeGuardError, UrlGuardError } from './lib/url-guard.mjs'
import { fetchSiteMetadata, SiteError } from './lib/site.mjs'
import { fetchGitHubProject, isGitHubRepoUrl, GitHubError } from './lib/github.mjs'
import { captureScreenshot, screenshotAvailability, ScreenshotError, VIEWPORTS } from './lib/screenshot.mjs'
import { safeFetch } from './lib/http.mjs'
import { generateCopy, generateCopyWithAI, aiConfig } from '../shared/copywriter.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT || 8931)
const HOST = process.env.HOST || '0.0.0.0'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true)
app.use(express.json({ limit: '256kb' }))

// ---------- 安全响应头 ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' blob: data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  )
  next()
})

// ---------- 简易限流（按「路由 + IP」分桶的令牌桶） ----------
// 分桶很关键：图片代理调用密集时不应该挤占截图或元信息接口的配额。
const rateBuckets = new Map()
function rateLimit({ capacity = 30, refillPerSec = 0.5 } = {}) {
  return (req, res, next) => {
    // 用路径前缀做桶名，避免不同接口互相占用配额
    const routeKey = `/${req.path.split('/').filter(Boolean).slice(0, 2).join('/')}`
    const key = `${routeKey}:${req.ip || 'unknown'}`
    const now = Date.now()
    let bucket = rateBuckets.get(key)
    if (!bucket) {
      bucket = { tokens: capacity, updated: now }
      rateBuckets.set(key, bucket)
    }
    const elapsed = (now - bucket.updated) / 1000
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec)
    bucket.updated = now
    if (bucket.tokens < 1) {
      const wait = Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerSec))
      res.setHeader('Retry-After', String(wait))
      res.status(429).json({ error: 'RATE_LIMITED', message: `请求过于频繁，请约 ${wait} 秒后再试。` })
      return
    }
    bucket.tokens -= 1
    next()
  }
}
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.updated > 600000) rateBuckets.delete(key)
  }
}, 120000).unref?.()

// ---------- 内存缓存 ----------
function makeCache({ maxEntries = 60, ttlMs = 30 * 60000, maxBytes = 96 * 1024 * 1024 } = {}) {
  const map = new Map()
  let bytes = 0
  return {
    get(key) {
      const item = map.get(key)
      if (!item) return null
      if (item.expires < Date.now()) {
        map.delete(key)
        bytes -= item.size
        return null
      }
      item.hits++
      return item
    },
    set(key, value, size = 0) {
      if (map.has(key)) {
        bytes -= map.get(key).size
        map.delete(key)
      }
      map.set(key, { ...value, size, expires: Date.now() + ttlMs, hits: 0 })
      bytes += size
      while (map.size > maxEntries || bytes > maxBytes) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        bytes -= map.get(oldest).size
        map.delete(oldest)
      }
    },
    stats() {
      return { entries: map.size, bytes }
    },
  }
}

const shotCache = makeCache({ maxEntries: 40, ttlMs: 30 * 60000, maxBytes: 80 * 1024 * 1024 })
const imageCache = makeCache({ maxEntries: 120, ttlMs: 60 * 60000, maxBytes: 80 * 1024 * 1024 })
// GitHub 元信息缓存：匿名配额 60 次/小时，缓存 10 分钟可显著降低烧配额的速度
const projectCache = makeCache({ maxEntries: 40, ttlMs: 10 * 60000 })

// ---------- 工具 ----------
function fail(res, status, code, message, hint = '') {
  res.status(status).json({ error: code, message, hint })
}

function normalizeInputUrl(raw) {
  if (typeof raw !== 'string') throw new UrlGuardError('请输入一个网址', 'URL_INVALID')
  let value = raw.trim()
  if (!value) throw new UrlGuardError('请输入一个网址', 'URL_INVALID')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    // 允许省略协议的输入
    value = `https://${value}`
  }
  return assertUrlSafe(value).href
}

// ---------- API ----------

app.get('/api/health', (req, res) => {
  const shot = screenshotAvailability()
  res.json({
    ok: true,
    time: new Date().toISOString(),
    version: '1.0.0',
    screenshot: {
      available: shot.available,
      executablePath: shot.executablePath,
      reason: shot.reason,
      limits: shot.limits,
    },
    ai: { enabled: aiConfig().enabled, model: aiConfig().enabled ? aiConfig().model : null },
    githubToken: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    viewports: Object.entries(VIEWPORTS).map(([key, v]) => ({ key, label: v.label, width: v.width, height: v.height })),
    cache: { screenshots: shotCache.stats(), images: imageCache.stats() },
  })
})

/**
 * 提取项目信息 + 生成文案
 * body: { url, ai?: boolean, withScreenshot?: boolean, viewport?: string }
 */
app.post('/api/extract', rateLimit({ capacity: 20, refillPerSec: 0.35 }), async (req, res) => {
  const started = Date.now()
  const { url, ai: wantAI = false, withScreenshot = false, viewport = 'desktop-1280' } = req.body || {}
  let normalized
  try {
    normalized = normalizeInputUrl(url)
  } catch (error) {
    return fail(res, 400, error.code || 'URL_INVALID', error.message, '请输入形如 https://github.com/owner/repo 的网址。')
  }

  const warnings = []
  let project = null
  const isGH = isGitHubRepoUrl(normalized)

  try {
    if (isGH) {
      // GitHub 匿名配额只有 60 次/小时，抓取结果做短期缓存，避免反复刷新把配额烧光
      const cachedProject = projectCache.get(normalized)
      if (cachedProject) {
        // 深拷贝，避免下面 push 截图素材时污染缓存对象（否则重复刷新会累积重复项）
        project = structuredClone(cachedProject.value)
        project.fetchedAt = new Date().toISOString()
        warnings.push('元信息来自 10 分钟内的缓存，未重复消耗 GitHub 接口配额。')
      } else {
        project = await fetchGitHubProject(normalized)
        projectCache.set(normalized, { value: structuredClone(project) }, 1)
      }
      warnings.push(...project.notes)
      // 有官网地址时，顺带尝试抓官网 OG 图作为备用视觉素材
      if (project.homepage) {
        try {
          const site = await fetchSiteMetadata(project.homepage)
          project.homepageMeta = {
            title: site.title,
            description: site.description,
            ogImage: site.ogImage,
            icon: site.icon,
            themeColor: site.themeColor,
            url: site.url,
          }
          if (site.ogImage) project.screenshots.push({ url: site.ogImage, kind: 'og', label: '官网分享图' })
        } catch {
          warnings.push('项目官网暂时无法访问，已跳过官网信息。')
        }
      }
      for (const image of project.readmeImages.slice(0, 6)) {
        project.screenshots.push({ url: image, kind: 'readme', label: 'README 图片' })
      }
    } else {
      project = await fetchSiteMetadata(normalized)
      if (project.ogImage) project.screenshots.push({ url: project.ogImage, kind: 'og', label: '分享封面图' })
      if (project.icon) project.screenshots.push({ url: project.icon, kind: 'icon', label: '站点图标' })
      if (project.repoLinks?.length) {
        warnings.push(`页面中发现了 GitHub 仓库 ${project.repoLinks[0]}，可以改用该仓库地址获取更完整的元信息。`)
      }
    }
  } catch (error) {
    if (error instanceof UrlGuardError) {
      return fail(res, 400, error.code, error.message, '只允许访问公网 http/https 地址。')
    }
    if (error instanceof GitHubError) {
      return fail(res, error.code === 'REPO_NOT_FOUND' ? 404 : 502, error.code, error.message, error.hint)
    }
    if (error instanceof SiteError) {
      return fail(res, 502, error.code, error.message, error.hint)
    }
    return fail(res, 502, 'EXTRACT_FAILED', error?.message || '提取失败', '可以切换到手动模式填写项目信息。')
  }

  // 真实网页截图
  let shotMeta = null
  if (withScreenshot) {
    const target = project.source === 'github' ? project.homepage || project.repoUrl : project.url
    try {
      const shot = await captureScreenshot(target, { viewportKey: viewport, fullPage: false })
      const id = crypto.randomUUID()
      shotCache.set(id, { buffer: shot.buffer, meta: shot }, shot.buffer.length)
      shotMeta = {
        id,
        width: shot.width,
        height: shot.height,
        finalUrl: shot.finalUrl,
        title: shot.title,
        blocked: shot.blocked,
        partial: Boolean(shot.partial),
        url: `/api/screenshot/${id}`,
      }
      if (shot.partial) {
        warnings.push('目标页面未在超时时间内加载完成，截图可能是部分内容。')
      }
      project.screenshots.unshift({ url: `/api/screenshot/${id}`, kind: 'capture', label: '真实网页截图', width: shot.width, height: shot.height })
    } catch (error) {
      const hint = error instanceof ScreenshotError ? error.hint : ''
      warnings.push(`网页截图失败：${error?.message || '未知错误'}${hint ? `（${hint}）` : ''}`)
    }
  }

  let copy = generateCopy(project)
  let aiError = ''
  if (wantAI) {
    try {
      copy = await generateCopyWithAI(project, copy)
    } catch (error) {
      aiError = error?.message || 'AI 生成失败'
      warnings.push(`AI 模式未生效：${aiError}（已回退到本地文案，可手动编辑）`)
    }
  }

  res.json({
    ok: true,
    elapsedMs: Date.now() - started,
    project,
    copy,
    screenshots: project.screenshots,
    shot: shotMeta,
    warnings,
    ai: { requested: Boolean(wantAI), used: copy.mode === 'ai', error: aiError },
    screenshotCapability: screenshotAvailability(),
  })
})

/** 只对 URL 做截图 */
app.post('/api/screenshot', rateLimit({ capacity: 20, refillPerSec: 0.25 }), async (req, res) => {
  const { url, viewport = 'desktop-1280', fullPage = false } = req.body || {}
  let normalized
  try {
    normalized = normalizeInputUrl(url)
  } catch (error) {
    return fail(res, 400, error.code || 'URL_INVALID', error.message, '请输入完整的 http/https 网址。')
  }
  try {
    const shot = await captureScreenshot(normalized, { viewportKey: viewport, fullPage: Boolean(fullPage) })
    const id = crypto.randomUUID()
    shotCache.set(id, { buffer: shot.buffer, meta: shot }, shot.buffer.length)
    res.json({
      ok: true,
      id,
      width: shot.width,
      height: shot.height,
      finalUrl: shot.finalUrl,
      title: shot.title,
      blocked: shot.blocked,
      partial: Boolean(shot.partial),
      url: `/api/screenshot/${id}`,
      capturedAt: shot.capturedAt,
    })
  } catch (error) {
    if (error instanceof UrlGuardError) return fail(res, 400, error.code, error.message, '只允许对公网网站截图。')
    if (error instanceof ScreenshotError) {
      const status = error.code === 'NO_BROWSER' ? 503 : error.code === 'SSRF_BLOCKED' ? 403 : 502
      return fail(res, status, error.code, error.message, error.hint)
    }
    return fail(res, 502, 'SHOT_FAILED', error?.message || '截图失败', '请稍后重试。')
  }
})

app.get('/api/screenshot/:id', (req, res) => {
  const hit = shotCache.get(req.params.id)
  if (!hit) return fail(res, 404, 'SHOT_EXPIRED', '这张截图已过期，请重新截图。')
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'private, max-age=1800')
  res.send(hit.buffer)
})
/**
 * 图片代理（用于把远程图片喂给前端画布，避免跨域污染 canvas）。
 * 只允许图片类型，限制大小。
 */
app.get('/api/image', rateLimit({ capacity: 120, refillPerSec: 3 }), async (req, res) => {
  const target = req.query.url
  if (typeof target !== 'string' || !target) return fail(res, 400, 'URL_INVALID', '缺少 url 参数')
  let normalized
  try {
    normalized = assertUrlSafe(target).href
  } catch (error) {
    return fail(res, 400, error.code || 'URL_BLOCKED', error.message, '只允许代理公网图片。')
  }

  const cached = imageCache.get(normalized)
  if (cached) {
    res.setHeader('Content-Type', cached.value.contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('X-Cache', 'HIT')
    return res.send(cached.value.buffer)
  }

  try {
    const upstream = await safeFetch(normalized, {
      timeoutMs: 20000,
      maxBytes: 12 * 1024 * 1024,
      maxRedirects: 3,
      headers: { accept: 'image/*,*/*;q=0.8', referer: new URL(normalized).origin + '/' },
    })
    if (upstream.status < 200 || upstream.status >= 300) {
      return fail(res, 502, 'UPSTREAM_STATUS', `图片地址返回 ${upstream.status}`)
    }
    const contentType = String(upstream.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    const isSvg = contentType === 'image/svg+xml'
    if (!contentType.startsWith('image/')) {
      return fail(res, 415, 'NOT_IMAGE', `该地址返回的不是图片（${contentType || '未知类型'}）`, '请换一张图片。')
    }
    if (isSvg) {
      // SVG 可能内嵌脚本，直接拒绝，避免任何注入风险
      return fail(res, 415, 'SVG_BLOCKED', '出于安全考虑，暂不支持 SVG 图片', '请使用 PNG / JPG / WebP。')
    }
    imageCache.set(normalized, { value: { buffer: upstream.body, contentType } }, upstream.body.length)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('X-Cache', 'MISS')
    res.send(upstream.body)
  } catch (error) {
    const info = describeGuardError(error)
    return fail(res, 502, info.code, info.message, '这张图片可能不可访问，可以换一张或跳过。')
  }
})

/** 单独重新生成文案 */
app.post('/api/copy', rateLimit({ capacity: 20, refillPerSec: 0.4 }), async (req, res) => {
  const { project, ai: wantAI = false } = req.body || {}
  if (!project || typeof project !== 'object') return fail(res, 400, 'BAD_REQUEST', '缺少 project 数据')
  let copy = generateCopy(project)
  let aiError = ''
  if (wantAI) {
    try {
      copy = await generateCopyWithAI(project, copy)
    } catch (error) {
      aiError = error?.message || 'AI 生成失败'
    }
  }
  res.json({ ok: true, copy, ai: { requested: Boolean(wantAI), used: copy.mode === 'ai', error: aiError } })
})

/** 手动模式：不需要任何网络，只把草稿整理成项目结构 */
app.post('/api/manual', (req, res) => {
  const { name = '', description = '', url = '', owner = '', tags = [] } = req.body || {}
  if (!String(name).trim()) return fail(res, 400, 'BAD_REQUEST', '请至少填写项目名称')
  const project = {
    source: 'manual',
    sourceUrl: String(url || '').trim(),
    fetchedAt: new Date().toISOString(),
    name: String(name).trim().slice(0, 120),
    fullName: String(name).trim().slice(0, 120),
    owner: String(owner || '').trim().slice(0, 80),
    description: String(description).trim().slice(0, 400),
    repoUrl: /^https?:\/\//.test(String(url)) ? String(url) : '',
    url: /^https?:\/\//.test(String(url)) ? String(url) : '',
    license: '',
    language: '',
    languages: [],
    stars: null,
    forks: null,
    topics: Array.isArray(tags) ? tags.slice(0, 8).map(String) : [],
    readmeRawTruncated: '',
    readmeExcerpt: [],
    readmeImages: [],
    screenshots: [],
    notes: ['手动填写：以下信息由用户提供，未经自动核验。'],
  }
  res.json({ ok: true, project, copy: generateCopy(project), warnings: project.notes })
})

// ---------- 静态站点（生产环境） ----------
const distDir = path.join(ROOT, 'dist')
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: 'index.html',
      setHeaders(res, filePath) {
        if (/\.(png|jpg|jpeg|webp|woff2?)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    })
  )
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((req, res) => fail(res, 404, 'NOT_FOUND', '接口不存在'))

app.use((error, req, res, next) => {
  console.error('[server error]', error)
  if (res.headersSent) return next(error)
  fail(res, 500, 'INTERNAL', '服务端出现异常，请稍后重试。')
})

const server = app.listen(PORT, HOST, () => {
  console.log(`[opensource-photo-studio] API 已启动: http://127.0.0.1:${PORT}`)
  const shot = screenshotAvailability()
  console.log(
    shot.available
      ? `[opensource-photo-studio] 截图引擎: ${shot.executablePath}`
      : `[opensource-photo-studio] 警告: ${shot.reason}`
  )
  if (fs.existsSync(distDir)) console.log('[opensource-photo-studio] 静态站点: dist/')
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))


