// 真实网页截图：使用本机已安装的 Chrome/Edge（playwright-core），
// 所有网络请求在 CDP 层做拦截，阻止内网/本地/危险协议/非 HTTP(S) 资源。
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import net from 'node:net'
import dns from 'node:dns/promises'
import { assertUrlSafe, checkIpAddress } from './url-guard.mjs'
import { Semaphore } from './limiter.mjs'

export const VIEWPORTS = {
  'desktop-1280': { width: 1280, height: 800, label: '桌面 1280×800' },
  'desktop-1440': { width: 1440, height: 900, label: '桌面 1440×900' },
  'laptop-1024': { width: 1024, height: 768, label: '笔记本 1024×768' },
  'mobile-390': { width: 390, height: 844, label: '手机 390×844（iPhone）' },
  'tablet-768': { width: 768, height: 1024, label: '平板 768×1024' },
}

const LIMITS = {
  navigationTimeoutMs: Number(process.env.SHOT_TIMEOUT_MS || 25000),
  totalBudgetMs: Number(process.env.SHOT_BUDGET_MS || 45000),
  maxHeight: Number(process.env.SHOT_MAX_HEIGHT || 3200),
  maxWidth: 2000,
  maxConcurrent: Number(process.env.SHOT_CONCURRENCY || 2),
  viewportScale: 2,
  maxOutputBytes: 12 * 1024 * 1024,
}

export const shotSemaphore = new Semaphore(LIMITS.maxConcurrent, 25000)

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/microsoft-edge',
].filter(Boolean)

export function findBrowserExecutable() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch {
      /* ignore */
    }
  }
  return null
}

export function screenshotAvailability() {
  const executablePath = findBrowserExecutable()
  return {
    available: Boolean(executablePath),
    executablePath: executablePath || null,
    reason: executablePath
      ? ''
      : '未找到 Chrome/Edge/Chromium。请安装浏览器，或在环境变量 CHROME_PATH 中指定浏览器可执行文件路径。',
    concurrency: shotSemaphore.stats,
    limits: {
      timeoutMs: LIMITS.navigationTimeoutMs,
      maxHeight: LIMITS.maxHeight,
      maxWidth: LIMITS.maxWidth,
      maxConcurrent: LIMITS.maxConcurrent,
    },
  }
}

// ---------- 请求拦截：阻断内网与危险目标 ----------

const BLOCKED_RESOURCE_TYPES = new Set(['media', 'websocket', 'manifest'])

async function isHostAllowed(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false
  }
  if (net.isIP(host)) return checkIpAddress(host) === null
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true })
    if (!records.length) return false
    return records.every((r) => checkIpAddress(r.address) === null)
  } catch {
    return false
  }
}

/**
 * 安装请求拦截：只允许 http/https，且主机必须解析到公网地址。
 * 被拦截的请求会被中止（不会触达目标）。
 */
async function installRequestGuard(context, onBlocked) {
  const cache = new Map()

  const decide = async (urlString) => {
    let url
    try {
      url = new URL(urlString)
    } catch {
      return { allow: false, reason: '网址格式无效' }
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:') return { allow: true }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { allow: false, reason: `协议 ${url.protocol} 被禁止` }
    }
    try {
      assertUrlSafe(url.href)
    } catch (error) {
      return { allow: false, reason: error.message }
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (cache.has(host)) return cache.get(host)
    const allowed = await isHostAllowed(host)
    const result = allowed ? { allow: true, reason: '' } : { allow: false, reason: `主机 ${host} 解析到内网或不可用地址` }
    cache.set(host, result)
    return result
  }

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
      onBlocked({ url, reason: `资源类型 ${request.resourceType()} 被禁止` })
      return route.abort().catch(() => {})
    }
    const verdict = await decide(url)
    if (!verdict.allow) {
      onBlocked({ url, reason: verdict.reason })
      return route.abort().catch(() => {})
    }
    return route.continue().catch(() => {})
  })

  await context.routeWebSocket?.(/.*/, (ws) => {
    onBlocked({ url: ws.url(), reason: 'WebSocket 被禁止' })
    ws.close().catch?.(() => {})
  })
}

// ---------- 截图主流程 ----------

export class ScreenshotError extends Error {
  constructor(message, code, hint) {
    super(message)
    this.name = 'ScreenshotError'
    this.code = code || 'SHOT_FAILED'
    this.hint = hint || ''
  }
}

/**
 * 对目标网址生成真实截图。
 * @returns {Promise<{ buffer: Buffer, width: number, height: number, finalUrl: string, title: string, blocked: Array, fullPage: boolean }>}
 */
export async function captureScreenshot(rawUrl, options = {}) {
  const {
    viewportKey = 'desktop-1280',
    fullPage = false,
    waitMs = 1200,
    colorScheme = 'light',
  } = options

  // 1. 先做协议 / 主机 / IP 校验（在启动浏览器之前就拒绝明显的坏目标）
  const url = assertUrlSafe(rawUrl)
  if (!(await isHostAllowed(url.hostname))) {
    throw new ScreenshotError('该地址解析到内网或不可用地址，已拒绝截图', 'SSRF_BLOCKED', '只允许对公网网站截图。')
  }

  const executablePath = findBrowserExecutable()
  if (!executablePath) {
    throw new ScreenshotError(
      '服务器没有可用的 Chrome/Edge 浏览器，无法进行真实截图',
      'NO_BROWSER',
      '请安装 Chrome/Chromium，或设置环境变量 CHROME_PATH 指向浏览器可执行文件。'
    )
  }

  const viewport = VIEWPORTS[viewportKey] || VIEWPORTS['desktop-1280']
  const width = Math.min(Math.max(320, Math.floor(viewport.width)), LIMITS.maxWidth)

  const release = await shotSemaphore.acquire()
  const startedAt = Date.now()
  let browser
  const blocked = []

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-first-run',
        '--disable-features=Translate,BackForwardCache,OptimizationHints',
        // 阻断私有网络访问（浏览器层兜底）
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
      timeout: 20000,
    })

    const context = await browser.newContext({
      viewport: { width, height: viewport.height },
      deviceScaleFactor: 1,
      colorScheme,
      reducedMotion: 'reduce',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      bypassCSP: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    })

    await installRequestGuard(context, (info) => {
      if (blocked.length < 40) blocked.push(info)
    })

    const page = await context.newPage()
    page.setDefaultTimeout(LIMITS.navigationTimeoutMs)
    page.setDefaultNavigationTimeout(LIMITS.navigationTimeoutMs)

    // 弹窗/新窗口一律拦截，防止绕过
    page.on('popup', (popup) => popup.close().catch(() => {}))

    let response
    let navigationTimedOut = false
    try {
      response = await page.goto(url.href, {
        waitUntil: 'domcontentloaded',
        timeout: LIMITS.navigationTimeoutMs,
      })
    } catch (error) {
      if (/Timeout|ERR_TIMED_OUT|interrupted/i.test(error?.message || '')) {
        // 有些站点（含被墙/限速的站点）首屏始终不触发 DOMContentLoaded，
        // 但页面其实已经渲染出内容。此时改为"尽力截图"，并明确告知用户是部分加载。
        const hasContent = await page
          .evaluate(() => {
            const body = document.body
            if (!body) return false
            const text = (body.innerText || '').trim()
            const hasMedia = body.querySelectorAll('img,svg,canvas,video').length > 0
            return text.length > 40 || hasMedia
          })
          .catch(() => false)
        if (!hasContent) {
          throw new ScreenshotError(
            '页面加载超时，且没有渲染出可截取的内容',
            'SHOT_TIMEOUT',
            '目标网站响应过慢或无法从服务器访问，可以稍后重试或改用其他模板。'
          )
        }
        navigationTimedOut = true
        blocked.push({ url: url.href, reason: '页面在超时时间内未完成加载，已截取当前可见内容' })
      } else {
        throw new ScreenshotError(`页面无法打开：${error.message}`, 'SHOT_FAILED', '请确认网址可以正常访问。')
      }
    }

    const finalUrl = page.url()
    // 跳转后的最终地址也要在允许范围内（超时兜底时页面可能停留在 chrome-error://）
    if (/^https?:/i.test(finalUrl)) {
      assertUrlSafe(finalUrl)
      if (!(await isHostAllowed(new URL(finalUrl).hostname))) {
        throw new ScreenshotError('页面跳转到了内网地址，已中止截图', 'SSRF_BLOCKED', '只允许对公网网站截图。')
      }
    } else if (!navigationTimedOut) {
      throw new ScreenshotError('页面被重定向到了非 HTTP(S) 地址，已中止截图', 'SSRF_BLOCKED', '只允许对公网网站截图。')
    }

    if (response && response.status() >= 400 && !navigationTimedOut) {
      throw new ScreenshotError(
        `目标页面返回 ${response.status()}`,
        'UPSTREAM_STATUS',
        response.status() === 404 ? '页面不存在，请检查网址。' : '该页面暂时无法访问。'
      )
    }

    // 等待视觉稳定：字体 / 图片加载 + 网络空闲（带总量预算）
    await page
      .evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready
        const images = [...document.images].filter((img) => !img.complete)
        await Promise.all(
          images.slice(0, 30).map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true })
                img.addEventListener('error', resolve, { once: true })
                setTimeout(resolve, 3000)
              })
          )
        )
      })
      .catch(() => {})

    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    if (waitMs > 0) await page.waitForTimeout(Math.min(waitMs, 3000))

    // 把页面滚动到底再回顶，触发懒加载
    await page
      .evaluate(async () => {
        const step = window.innerHeight * 0.9
        const maxScroll = Math.min(document.body.scrollHeight, window.innerHeight * 6)
        for (let y = 0; y < maxScroll; y += step) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 90))
        }
        window.scrollTo(0, 0)
      })
      .catch(() => {})
    await page.waitForTimeout(250)

    const title = (await page.title().catch(() => '')) || ''

    // 尺寸受限的整页截图
    const metrics = await page
      .evaluate(() => ({
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      }))
      .catch(() => ({ scrollHeight: viewport.height, scrollWidth: width }))

    const targetHeight = fullPage
      ? Math.min(metrics.scrollHeight || viewport.height, LIMITS.maxHeight)
      : viewport.height

    if (fullPage && metrics.scrollHeight > LIMITS.maxHeight) {
      // 用视口裁剪法获得高度有限的"长截图"
      await page.setViewportSize({ width, height: targetHeight })
      await page.waitForTimeout(200)
    }

    if (Date.now() - startedAt > LIMITS.totalBudgetMs) {
      throw new ScreenshotError('截图任务超出时间预算，已中止', 'SHOT_TIMEOUT', '请稍后重试。')
    }

    const buffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      timeout: LIMITS.navigationTimeoutMs,
    })

    if (buffer.length > LIMITS.maxOutputBytes) {
      throw new ScreenshotError('截图文件过大，已中止', 'SHOT_TOO_LARGE', '请尝试较小的视口或改用项目卡片模板。')
    }

    const pageTitle = title.slice(0, 300)
    await context.close().catch(() => {})

    return {
      buffer,
      width,
      height: targetHeight,
      finalUrl,
      title: pageTitle,
      blocked: blocked.slice(0, 20),
      fullPage: Boolean(fullPage),
      viewportKey,
      partial: navigationTimedOut,
      capturedAt: new Date().toISOString(),
    }
  } catch (error) {
    if (error instanceof ScreenshotError) throw error
    throw new ScreenshotError(
      `截图失败：${error?.message || '未知错误'}`,
      'SHOT_FAILED',
      '请稍后重试，或改用其他模板配合已有图片。'
    )
  } finally {
    if (browser) await browser.close().catch(() => {})
    release()
  }
}
