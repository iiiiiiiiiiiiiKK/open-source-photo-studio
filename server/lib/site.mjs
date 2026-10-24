// 普通网站元信息提取：标题、描述、图标、Open Graph、主题色等。
// 只做一次 HTML GET，不执行任何页面脚本。
import { fetchText, HttpError } from './http.mjs'

const MAX_HTML_BYTES = 3 * 1024 * 1024

export class SiteError extends Error {
  constructor(message, code, hint) {
    super(message)
    this.name = 'SiteError'
    this.code = code || 'SITE_ERROR'
    this.hint = hint || ''
  }
}

function decodeEntities(input) {
  if (!input) return ''
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', middot: '·', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', times: '×', copy: '©', reg: '®', trade: '™', bull: '•',
  }
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (match, name) => named[name.toLowerCase()] ?? match)
}

function safeFromCodePoint(code) {
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

function cleanText(input, max = 400) {
  return decodeEntities(String(input || ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function metaContent(html, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m?.[1]) return cleanText(m[1])
    }
  }
  return ''
}

function linkHref(html, rel) {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<link[^>]+rel\\s*=\\s*["'][^"']*${escaped}[^"']*["'][^>]*href\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<link[^>]+href\\s*=\\s*["']([^"']+)["'][^>]*rel\\s*=\\s*["'][^"']*${escaped}[^"']*["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

function absolute(base, maybeRelative) {
  if (!maybeRelative) return ''
  try {
    return new URL(maybeRelative, base).href
  } catch {
    return ''
  }
}

function stripTags(html) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
    1200
  )
}

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const results = []
  for (const block of blocks.slice(0, 5)) {
    try {
      const parsed = JSON.parse(block[1].trim())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        if (item['@graph']) {
          for (const node of item['@graph']) results.push(node)
        }
        results.push(item)
      }
    } catch {
      /* 忽略无效 JSON-LD */
    }
  }
  return results
}

function findRepoLinks(html, baseUrl) {
  const links = []
  const re = /href\s*=\s*["'](https?:\/\/github\.com\/[\w.-]+\/[\w.-]+)["']/gi
  let m
  while ((m = re.exec(html))) {
    const href = m[1].replace(/\.git$/, '').replace(/\/$/, '')
    if (!/github\.com\/[^/]+\/[^/]+$/.test(href)) continue
    if (!links.includes(href)) links.push(href)
    if (links.length >= 5) break
  }
  return links
}

/** 抓取普通网站元信息（不截图） */
export async function fetchSiteMetadata(rawUrl) {
  let res
  try {
    res = await fetchText(rawUrl, {
      timeoutMs: 15000,
      maxBytes: MAX_HTML_BYTES,
      maxRedirects: 4,
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
  } catch (error) {
    if (error?.name === 'UrlGuardError') {
      // 重定向或 DNS 解析落到内网/危险地址：明确报告 SSRF 拦截，而不是笼统的失败
      throw new SiteError(
        `已拦截不安全的跳转：${error.message}`,
        'REDIRECT_BLOCKED',
        '目标网站试图跳转到内网、本机或非 HTTP(S) 地址，出于安全原因停止访问。'
      )
    }
    if (error instanceof HttpError) {
      const map = {
        TIMEOUT: ['访问目标网站超时', '该网站响应过慢或被防火墙拦截，可以改用截图以外的信息，或手动填写。'],
        DNS_FAILED: ['无法解析该域名', '请检查网址是否正确。'],
        TOO_MANY_REDIRECTS: ['目标网站跳转次数过多', '为避免进入异常站点，已停止访问。'],
        NETWORK_ERROR: ['连接目标网站失败', '该网站可能拒绝访问或已下线。'],
        TOO_LARGE: ['页面体积过大', '已停止读取，可以手动填写项目信息。'],
      }
      const [message, hint] = map[error.code] || [`访问失败：${error.message}`, '请稍后重试或手动填写。']
      throw new SiteError(message, error.code, hint)
    }
    throw new SiteError(error?.message || '访问目标网站失败', 'SITE_ERROR', '请稍后重试或手动填写。')
  }

  const contentType = String(res.headers['content-type'] || '')
  if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
    throw new SiteError(
      `这个网址返回的不是网页（${contentType.split(';')[0]}）`,
      'NOT_HTML',
      '请填写项目官网首页地址，而不是图片或文件的直链。'
    )
  }

  const html = res.text
  const finalUrl = res.finalUrl
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
  const jsonLd = extractJsonLd(html)

  const ogTitle = metaContent(html, ['og:title', 'twitter:title'])
  const ogDescription = metaContent(html, ['og:description', 'twitter:description'])
  const description = metaContent(html, ['description'])
  const siteName = metaContent(html, ['og:site_name', 'application-name'])
  const themeColor = metaContent(html, ['theme-color'])

  const h1 = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ') || '', 200)
  const lead = html.match(/<p[^>]*>([\s\S]{20,400}?)<\/p>/i)?.[1] || ''

  const title = cleanText(ogTitle || titleTag || h1 || new URL(finalUrl).hostname, 200)
  const summary = cleanText(ogDescription || description || lead.replace(/<[^>]+>/g, '') || '', 400)

  const icons = [
    linkHref(html, 'apple-touch-icon'),
    linkHref(html, 'icon'),
    linkHref(html, 'shortcut icon'),
  ]
    .filter(Boolean)
    .map((href) => absolute(finalUrl, href))

  const ogImage =
    absolute(finalUrl, metaContent(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'])) || ''

  const logoUrl =
    absolute(finalUrl, metaContent(html, ['og:logo'])) ||
    jsonLd.map((node) => node?.logo).find((l) => typeof l === 'string') ||
    ''

  const fromJsonLd = jsonLd.find((node) => node?.description)?.description || ''

  return {
    source: 'website',
    sourceUrl: finalUrl,
    requestedUrl: rawUrl,
    fetchedAt: new Date().toISOString(),
    name: cleanText(siteName || title, 120),
    title,
    description: summary || cleanText(fromJsonLd, 400),
    siteName,
    url: finalUrl,
    host: new URL(finalUrl).hostname,
    icon: icons.find(Boolean) ? absolute(finalUrl, icons.find(Boolean)) : absolute(finalUrl, '/favicon.ico'),
    icons: icons.slice(0, 4),
    ogImage,
    logoUrl: absolute(finalUrl, logoUrl),
    themeColor,
    h1,
    textSample: stripTags(html),
    repoLinks: findRepoLinks(html, finalUrl),
    images: [ogImage].filter(Boolean),
    screenshots: [],
    readmeImages: [],
    readmeExcerpt: [],
    readmeRawTruncated: '',
    topics: [],
    languages: [],
    stars: null,
    forks: null,
    notes: [],
  }
}
