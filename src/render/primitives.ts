// 通用绘制原语：颜色、纸张纹理、细线、胶囊标签、指标条、窗口框。
import type { FontKey } from './text'
import { fontString, drawSpacedText, measureSpacedText } from './text'

export const PALETTE = {
  paper: '#F5F2EA',
  paperSoft: '#FBFAF6',
  ink: '#15161A',
  inkSoft: '#2A2C33',
  muted: '#6E6C66',
  line: '#D8D3C6',
  dark: '#0F1116',
  darkSoft: '#171A21',
  darkLine: '#2B3040',
  chalk: '#E8E6DF',
}

export function hexToRgb(hex: string): [number, number, number] {
  let value = String(hex || '').trim().replace('#', '')
  if (value.length === 3) value = value.split('').map((c) => c + c).join('')
  if (value.length !== 6 || !/^[0-9a-f]{6}$/i.test(value)) return [21, 22, 26]
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const p = Math.max(0, Math.min(1, t))
  const to = (x: number) => Math.round(x).toString(16).padStart(2, '0')
  return `#${to(r1 + (r2 - r1) * p)}${to(g1 + (g2 - g1) * p)}${to(b1 + (b2 - b1) * p)}`
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function readableOn(background: string, dark = PALETTE.ink, light = '#FFFFFF'): string {
  return luminance(background) > 0.45 ? dark : light
}

/** 确定性伪随机，保证同一次渲染结果稳定（截图/导出可复现） */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** 纸张颗粒：稀疏噪点，避免大面积纯色显得廉价 */
export function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { color?: string; alpha?: number; density?: number; seed?: number } = {}) {
  const { color = '#000000', alpha = 0.05, density = 0.00035, seed = 91 } = opts
  const random = mulberry32(seed)
  const count = Math.round(w * h * density)
  ctx.save()
  ctx.fillStyle = rgba(color, alpha)
  for (let i = 0; i < count; i++) {
    const x = random() * w
    const y = random() * h
    const size = 0.6 + random() * 1.2
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()
}

/** 点阵网格，作为"设计稿"底纹 */
export function dotGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts: { step?: number; radius?: number; color?: string; alpha?: number } = {}) {
  const { step = 24, radius = 1, color = '#000000', alpha = 0.08 } = opts
  ctx.save()
  ctx.fillStyle = rgba(color, alpha)
  for (let gx = x; gx <= x + w; gx += step) {
    for (let gy = y; gy <= y + h; gy += step) {
      ctx.beginPath()
      ctx.arc(gx, gy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

export function hairline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, thickness = 1) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = thickness
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.stroke()
  ctx.restore()
}

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: {
    size: number
    weight?: number | string
    family?: FontKey
    color?: string
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
    maxWidth?: number
    alpha?: number
    tracking?: number
  }
) {
  const { size, weight = 400, family = 'sans', color = PALETTE.ink, align = 'left', baseline = 'alphabetic', maxWidth, alpha = 1, tracking } = opts
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = fontString(size, weight, family)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  if (tracking) {
    if (align === 'left') drawSpacedText(ctx, value, x, y, tracking, 'left')
    else if (align === 'right') drawSpacedText(ctx, value, x, y, tracking, 'right')
    else drawSpacedText(ctx, value, x, y, tracking, 'center')
  } else {
    ctx.fillText(value, x, y, maxWidth)
  }
  ctx.restore()
}

export function measure(ctx: CanvasRenderingContext2D, value: string, size: number, weight: number | string, family: FontKey, tracking = 0): number {
  ctx.save()
  ctx.font = fontString(size, weight, family)
  const width = tracking ? measureSpacedText(ctx, value, tracking) : ctx.measureText(value).width
  ctx.restore()
  return width
}

/** 圆角矩形填充 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  strokeWidth = 1
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
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
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.stroke()
  }
}

export function shadow(ctx: CanvasRenderingContext2D, opts: { color?: string; blur?: number; x?: number; y?: number }) {
  const { color = 'rgba(20,18,12,0.18)', blur = 30, x = 0, y = 14 } = opts
  ctx.shadowColor = color
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = x
  ctx.shadowOffsetY = y
}

export function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/** 小标签胶囊（kicker / topic） */
export function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  opts: {
    size?: number
    color?: string
    fill?: string
    stroke?: string
    family?: FontKey
    tracking?: number
    paddingX?: number
    height?: number
    weight?: number | string
  } = {}
): number {
  const {
    size = 12,
    color = PALETTE.ink,
    fill = 'transparent',
    stroke,
    family = 'sans',
    tracking = 0.6,
    paddingX = 12,
    height = 28,
    weight = 600,
  } = opts
  const labelText = label.toUpperCase()
  const width = measure(ctx, labelText, size, weight, family, tracking) + paddingX * 2
  if (fill !== 'transparent') roundRect(ctx, x, y, width, height, height / 2, fill)
  if (stroke) roundRect(ctx, x, y, width, height, height / 2, undefined, stroke, 1)
  text(ctx, labelText, x + paddingX, y + height / 2 + size * 0.34, {
    size,
    weight,
    family,
    color,
    tracking,
  })
  return width
}

export interface MetricItem {
  label: string
  value: string
  known: boolean
}

/** 指标条：值在上、标签在下，中间用细线分隔 */
export function metricsBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  metrics: MetricItem[],
  opts: { color?: string; mutedColor?: string; lineColor?: string; size?: number; labelSize?: number; separators?: boolean; align?: 'left' | 'center' } = {}
) {
  const {
    color = PALETTE.ink,
    mutedColor = PALETTE.muted,
    lineColor = PALETTE.line,
    size = 24,
    labelSize = 11,
    separators = true,
    align = 'left',
  } = opts
  if (!metrics.length) return
  const colWidth = w / metrics.length
  metrics.forEach((metric, index) => {
    const cx = x + colWidth * index + (align === 'center' ? colWidth / 2 : 0)
    const anchor: CanvasTextAlign = align === 'center' ? 'center' : 'left'
    text(ctx, metric.value, cx, y + size, {
      size,
      weight: 700,
      color: metric.known ? color : rgba(lineColor, 0.95),
      align: anchor,
    })
    text(ctx, metric.label.toUpperCase(), cx, y + size + labelSize + 10, {
      size: labelSize,
      weight: 600,
      color: mutedColor,
      align: anchor,
      tracking: 0.9,
      alpha: metric.known ? 0.95 : 0.55,
    })
    if (separators && index > 0) {
      ctx.save()
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + colWidth * index, y - 2)
      ctx.lineTo(x + colWidth * index, y + size + labelSize + 14)
      ctx.stroke()
      ctx.restore()
    }
  })
}

/** 带浏览器窗口外框的截图（含标题栏圆点） */
export function screenshotFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    radius?: number
    chrome?: number
    bg?: string
    border?: string
    urlLabel?: string
    dotColors?: string[]
    zoom?: number
    offsetX?: number
    offsetY?: number
    mutedColor?: string
    withShadow?: boolean
    emptyLabel?: string
    /** cover=居中填满，top=按宽度铺满并贴顶（更像真实浏览器），contain=完整显示 */
    treatment?: 'cover' | 'top' | 'contain'
  } = {}
) {
  const {
    radius = 14,
    chrome = 30,
    bg = '#FFFFFF',
    border = 'rgba(0,0,0,0.10)',
    urlLabel = '',
    dotColors = ['#E3675B', '#E9B44C', '#63A96B'],
    zoom = 1,
    offsetX = 0,
    offsetY = 0,
    mutedColor = PALETTE.muted,
    withShadow = true,
    emptyLabel = '暂无可用截图',
    treatment = 'cover',
  } = opts

  ctx.save()
  if (withShadow) {
    shadow(ctx, { color: 'rgba(24,20,12,0.16)', blur: 34, y: 16 })
  }
  roundRect(ctx, x, y, w, h, radius, bg)
  clearShadow(ctx)

  // 标题栏
  if (chrome > 0) {
    ctx.save()
    roundRect(ctx, x, y, w, h, radius, undefined, undefined)
    ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.035)'
    ctx.fillRect(x, y, w, chrome)
    const r = Math.max(3, chrome * 0.13)
    dotColors.forEach((color, index) => {
      ctx.beginPath()
      ctx.arc(x + 16 + index * (r * 3.2), y + chrome / 2, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
    if (urlLabel) {
      ctx.font = fontString(Math.max(9, chrome * 0.33), 500, 'mono')
      ctx.fillStyle = rgba(mutedColor, 0.95)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(urlLabel, x + w / 2, y + chrome / 2 + 0.5, w - 160)
    }
    ctx.restore()
  }

  // 内容区
  const innerY = y + chrome
  const innerH = h - chrome
  ctx.save()
  roundRect(ctx, x, innerY, w, innerH, radius, undefined, undefined)
  // 只让底部两个角圆
  ctx.beginPath()
  ctx.moveTo(x, innerY)
  ctx.lineTo(x + w, innerY)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.closePath()
  ctx.clip()

  if (img) {
    if (treatment === 'contain') {
      const scale = Math.min(w / img.width, innerH / img.height) * zoom
      const drawW = img.width * scale
      const drawH = img.height * scale
      const dx = x + (w - drawW) / 2 + offsetX * (w / 2)
      const dy = innerY + (innerH - drawH) / 2 + offsetY * (innerH / 2)
      ctx.fillStyle = bg
      ctx.fillRect(x, innerY, w, innerH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, dx, dy, drawW, drawH)
    } else if (treatment === 'top') {
      // 按宽度铺满，从页面顶部开始显示（最接近"打开网页第一屏"的观感）
      const scale = (w / img.width) * zoom
      const drawW = img.width * scale
      const drawH = img.height * scale
      const dx = x + (w - drawW) / 2 + offsetX * (w / 2)
      const dy = innerY + offsetY * (innerH / 2)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, dx, dy, drawW, drawH)
    } else {
      const scale = Math.max(w / img.width, innerH / img.height) * zoom
      const drawW = img.width * scale
      const drawH = img.height * scale
      const dx = x + (w - drawW) / 2 + offsetX * (w / 2)
      const dy = innerY + (innerH - drawH) / 2 + offsetY * (innerH / 2)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, dx, dy, drawW, drawH)
    }
  } else {
    ctx.fillStyle = rgba(PALETTE.line, 0.28)
    ctx.fillRect(x, innerY, w, innerH)
    // 交叉细线，表明"此处应有截图"
    ctx.strokeStyle = rgba(PALETTE.muted, 0.3)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, innerY)
    ctx.lineTo(x + w, y + h)
    ctx.moveTo(x + w, innerY)
    ctx.lineTo(x, y + h)
    ctx.stroke()
    ctx.font = fontString(Math.max(11, w * 0.028), 500, 'sans')
    ctx.fillStyle = rgba(PALETTE.muted, 0.85)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emptyLabel, x + w / 2, innerY + innerH / 2, w - 40)
  }
  ctx.restore()

  // 外描边
  roundRect(ctx, x, y, w, h, radius, undefined, border, 1)
  ctx.restore()
}

/** 头像 + 名称行 */
export function avatarRow(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  name: string,
  opts: { color?: string; mutedColor?: string; size?: number; radius?: number; accent?: string; sub?: string } = {}
) {
  const { color = PALETTE.ink, mutedColor = PALETTE.muted, size = 14, accent = '#C8A24A', sub = '' } = opts
  const r = size * 0.95
  ctx.save()
  if (img) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height)
    ctx.drawImage(img, x + r - (img.width * scale) / 2, y + r - (img.height * scale) / 2, img.width * scale, img.height * scale)
    ctx.restore()
  } else {
    ctx.beginPath()
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
    ctx.fillStyle = rgba(accent, 0.18)
    ctx.fill()
    ctx.font = fontString(size * 0.9, 700, 'sans')
    ctx.fillStyle = accent
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name.slice(0, 1).toUpperCase(), x + r, y + r + 0.5)
  }
  ctx.restore()

  text(ctx, name, x + r * 2 + 12, y + r + (sub ? -2 : size * 0.36), { size, weight: 600, color })
  if (sub) text(ctx, sub, x + r * 2 + 12, y + r + size * 0.86, { size: size * 0.78, weight: 400, color: mutedColor })
}

/** 语言构成条形图 */
export function languageBars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  languages: { name: string; percent: number }[],
  opts: { color?: string; accent?: string; labelSize?: number; barHeight?: number; max?: number } = {}
) {
  const { color = PALETTE.ink, accent = '#C8A24A', labelSize = 12, barHeight = 4, max = 4 } = opts
  const items = languages.slice(0, max)
  if (!items.length) return 0
  const rowGap = labelSize * 2.35
  items.forEach((item, index) => {
    const rowY = y + index * rowGap
    text(ctx, item.name, x, rowY + labelSize * 0.8, { size: labelSize, weight: 500, color })
    text(ctx, `${Math.round(item.percent)}%`, x + w, rowY + labelSize * 0.8, {
      size: labelSize,
      weight: 600,
      color: index === 0 ? accent : color,
      align: 'right',
    })
    const trackY = rowY + labelSize + 8
    ctx.save()
    ctx.fillStyle = rgba(color, 0.12)
    ctx.fillRect(x, trackY, w, barHeight)
    ctx.fillStyle = index === 0 ? accent : rgba(color, 0.45)
    ctx.fillRect(x, trackY, Math.max(2, (w * item.percent) / 100), barHeight)
    ctx.restore()
  })
  return items.length * rowGap
}
