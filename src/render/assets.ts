// 图片资产管理。
// - 服务端模式：远程图片统一走 /api/image 代理，天然同源，canvas 不会被污染。
// - 静态模式（GitHub Pages）：没有代理，只能直连并用 crossOrigin='anonymous'。
//   只有返回 CORS 头的站（raw.githubusercontent.com、avatars.githubusercontent.com、
//   opengraph.githubassets.com）能进画布；不带 CORS 的（user-images.githubusercontent.com）
//   会加载失败 —— 此时按"缺图"处理，绝不把被污染的 canvas 拿去导出。

import { getCachedMode } from '../lib/api'

export interface LoadedImage {
  id: string
  url: string
  image: HTMLImageElement
  width: number
  height: number
  proxyUrl: string
}

const cache = new Map<string, LoadedImage>()
const pending = new Map<string, Promise<LoadedImage>>()

/** 记录哪些站点实测不带 CORS，避免每次渲染都重试 */
const corsBlockedHosts = new Set<string>()

function isStaticMode(): boolean {
  return getCachedMode() === 'static'
}

export function toProxiedUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/api/')) return url
  if (!/^https?:\/\//i.test(url)) return url
  // 静态模式没有 /api/image，直接返回原地址（下面会带 crossOrigin 加载）
  if (isStaticMode()) return url
  return `/api/image?url=${encodeURIComponent(url)}`
}

export async function loadImage(url: string): Promise<LoadedImage> {
  const proxied = toProxiedUrl(url)
  if (cache.has(proxied)) return cache.get(proxied)!
  if (pending.has(proxied)) return pending.get(proxied)!

  if (isStaticMode()) {
    try {
      const host = new URL(url).hostname
      if (corsBlockedHosts.has(host)) {
        throw new Error(`该图床不返回 CORS 头，静态版无法使用：${host}`)
      }
    } catch {
      /* URL 解析失败交给下面处理 */
    }
  }

  const task = new Promise<LoadedImage>((resolve, reject) => {
    const img = new Image()
    const remote = !/^(\/|data:|blob:)/.test(proxied)
    // 远程图片必须带 crossOrigin，否则 canvas 会被污染，导出时报错
    if (remote) img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      const loaded: LoadedImage = {
        id: url,
        url,
        image: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        proxyUrl: proxied,
      }
      cache.set(proxied, loaded)
      pending.delete(proxied)
      resolve(loaded)
    }
    img.onerror = () => {
      pending.delete(proxied)
      if (isStaticMode() && remote) {
        try {
          corsBlockedHosts.add(new URL(url).hostname)
        } catch {
          /* ignore */
        }
      }
      reject(new Error(isStaticMode() ? `图片无法在浏览器里直接读取（可能缺少 CORS）：${url}` : `图片加载失败：${url}`))
    }
    img.src = proxied
  })
  pending.set(proxied, task)
  return task
}

export function getCachedImage(url: string): LoadedImage | null {
  return cache.get(toProxiedUrl(url)) ?? null
}

export function clearImageCache() {
  cache.clear()
  pending.clear()
  corsBlockedHosts.clear()
}

/**
 * 在矩形区域内绘制图片，支持 zoom / 偏移 / cover-contain。
 * 偏移量以区域宽高的比例表示（-1 ~ 1）。
 */
export function drawImageInRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { zoom?: number; offsetX?: number; offsetY?: number; mode?: 'cover' | 'contain'; radius?: number } = {}
) {
  const { zoom = 1, offsetX = 0, offsetY = 0, mode = 'cover', radius = 0 } = options
  if (!img.width || !img.height) return
  ctx.save()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.clip()

  const scaleBase = mode === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height)
  const scale = scaleBase * Math.max(0.2, zoom)
  const drawW = img.width * scale
  const drawH = img.height * scale
  const dx = x + (w - drawW) / 2 + offsetX * (w / 2)
  const dy = y + (h - drawH) / 2 + offsetY * (h / 2)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, dx, dy, drawW, drawH)
  ctx.restore()
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  if (radius <= 0.01) {
    ctx.rect(x, y, w, h)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/** 圆形裁切头像 */
export function drawRoundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  const scale = Math.max((r * 2) / img.width, (r * 2) / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
  ctx.restore()
}
