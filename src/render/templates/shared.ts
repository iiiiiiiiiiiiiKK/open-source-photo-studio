import type { DesignState, ProjectInfo } from '../../types'
import type { Frame } from '../geometry'
import { fontString, wrapText, fitText, drawLines, drawSpacedText, measureSpacedText } from '../text'
import { PALETTE, rgba, text, measure, roundRect, hairline, mix, readableOn, luminance } from '../primitives'

export interface TemplateImages {
  main: HTMLImageElement | null
  avatar: HTMLImageElement | null
  icon: HTMLImageElement | null
  gallery: HTMLImageElement[]
}

export interface TemplateContext {
  ctx: CanvasRenderingContext2D
  design: DesignState
  project: ProjectInfo | null
  frame: Frame
  images: TemplateImages
}

export interface TemplateMeta {
  id: string
  name: string
  tagline: string
  /** 该模板偏好的浅色/深色背景默认值 */
  defaultBackground: string
  defaultAccent: string
  /** 该模板是否依赖截图 */
  needsScreenshot: boolean
  render: (ctx: TemplateContext) => void
}

export function designTone(design: DesignState) {
  const dark = luminance(design.background) < 0.35
  return {
    dark,
    ink: dark ? PALETTE.chalk : PALETTE.ink,
    inkSoft: dark ? '#B9BDC9' : PALETTE.inkSoft,
    muted: dark ? '#8A90A0' : PALETTE.muted,
    line: dark ? '#2E3444' : PALETTE.line,
    panel: dark ? mix(design.background, '#FFFFFF', 0.06) : mix(design.background, '#FFFFFF', 0.55),
    paper: design.background,
  }
}

/** 项目展示名：优先 fullName，其次 name */
export function displayName(project: ProjectInfo | null, design: DesignState): string {
  return design.title || project?.fullName || project?.name || '未命名项目'
}

export function repoLine(project: ProjectInfo | null): string {
  if (!project) return ''
  if (project.source === 'github') return project.repoUrl || project.sourceUrl || ''
  return project.url || project.sourceUrl || ''
}

export function dateStamp(project: ProjectInfo | null): string {
  const iso = project?.fetchedAt
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** 页脚：仓库地址 + 抓取日期，小字号、低对比 */
export function drawFooter(ctx: CanvasRenderingContext2D, c: TemplateContext, x: number, y: number, w: number, opts: { color?: string; align?: 'left' | 'right' | 'between'; size?: number } = {}) {
  const { color = PALETTE.muted, align = 'between', size = 12 } = opts
  const line = repoLine(c.project)
  const stamp = dateStamp(c.project)
  const family = c.design.font === 'serif' ? 'serif' : c.design.font
  ctx.save()
  ctx.font = fontString(size, 500, family as never)
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  const isMono = c.design.font === 'mono'
  if (align === 'between') {
    ctx.textAlign = 'left'
    if (isMono) drawSpacedText(ctx, line, x, y, 0.2, 'left')
    else ctx.fillText(line, x, y, w * 0.72)
    if (stamp) {
      const stampText = c.design.footer || stamp
      ctx.textAlign = 'right'
      if (isMono) {
        drawSpacedText(ctx, stampText, x + w, y, 0.4, 'right')
      } else {
        drawSpacedText(ctx, stampText.toUpperCase(), x + w, y, 1.1, 'right')
      }
    }
  } else if (align === 'right') {
    ctx.textAlign = 'right'
    ctx.fillText(line, x + w, y, w)
  } else {
    ctx.textAlign = 'left'
    ctx.fillText(line, x, y, w)
  }
  ctx.restore()
}

/** 强调色小方块序列，作为编辑部风格的视觉锚点 */
export function accentRule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, thickness = 3) {
  ctx.save()
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, thickness)
  ctx.restore()
}

export interface TitleBlockOptions {
  x: number
  y: number
  width: number
  maxHeight: number
  size: number
  minSize: number
  color: string
  family: 'sans' | 'serif' | 'mono' | 'rounded'
  weight?: number | string
  lineHeightRatio?: number
  align?: CanvasTextAlign
  maxLines?: number
}

/** 自适应标题：长标题自动降字号并合理断行，永不溢出版面 */
export function drawTitleBlock(ctx: CanvasRenderingContext2D, title: string, options: TitleBlockOptions) {
  const {
    x,
    y,
    width,
    maxHeight,
    size,
    minSize,
    color,
    family,
    weight = 700,
    lineHeightRatio = 1.1,
    align = 'left',
    maxLines = 3,
  } = options
  const fitted = fitText(ctx, title, {
    maxWidth: width,
    maxHeight,
    fontFamily: family,
    weight,
    preferred: size,
    minSize,
    lineHeightRatio,
    maxLines,
  })
  ctx.save()
  ctx.fillStyle = color
  ctx.font = fontString(fitted.fontSize, weight, family)
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  const anchorX = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x
  let cursor = y + fitted.fontSize
  for (const line of fitted.lines) {
    ctx.fillText(line, anchorX, cursor, width)
    cursor += fitted.lineHeight
  }
  ctx.restore()
  return { height: fitted.lines.length * fitted.lineHeight, lines: fitted.lines, fontSize: fitted.fontSize }
}

/** 多行正文，自动裁到 maxHeight，末行带省略号 */
export function drawParagraph(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  maxHeight: number,
  opts: { size: number; color: string; family?: 'sans' | 'serif' | 'mono' | 'rounded'; weight?: number; lineHeightRatio?: number }
) {
  const { size, color, family = 'sans', weight = 400, lineHeightRatio = 1.62 } = opts
  const lineHeight = size * lineHeightRatio
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
  ctx.save()
  ctx.font = fontString(size, weight, family)
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const lines = wrapText(ctx, value, { maxWidth: width, maxLines })
  let cursor = y + size
  for (const line of lines) {
    ctx.fillText(line, x, cursor, width)
    cursor += lineHeight
  }
  ctx.restore()
  return lines.length * lineHeight
}

/** 亮点列表：带序号/圆点，逐条省略号截断 */
export function drawHighlights(
  ctx: CanvasRenderingContext2D,
  items: string[],
  x: number,
  y: number,
  width: number,
  opts: {
    size: number
    color: string
    accent: string
    rowGap?: number
    maxLinesPerItem?: number
    marker?: 'dot' | 'dash' | 'number' | 'square'
    family?: 'sans' | 'serif' | 'mono' | 'rounded'
    mutedColor?: string
    maxItems?: number
  }
) {
  const {
    size,
    color,
    accent,
    rowGap = 12,
    maxLinesPerItem = 2,
    marker = 'dot',
    family = 'sans',
    mutedColor,
    maxItems = 5,
  } = opts
  const lineHeight = size * 1.5
  const markerWidth = marker === 'number' ? size * 2.1 : size * 1.25
  const textWidth = width - markerWidth
  let cursor = y
  const used = items.slice(0, maxItems)
  used.forEach((item, index) => {
    ctx.save()
    ctx.font = fontString(size, 500, family)
    const lines = wrapText(ctx, item, { maxWidth: textWidth, maxLines: maxLinesPerItem })
    ctx.fillStyle = color
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    // 标记
    const baseY = cursor + size
    if (marker === 'dot') {
      ctx.beginPath()
      ctx.arc(x + size * 0.34, baseY - size * 0.32, Math.max(1.6, size * 0.14), 0, Math.PI * 2)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.fillStyle = color
    } else if (marker === 'square') {
      ctx.fillStyle = accent
      ctx.fillRect(x, baseY - size * 0.62, size * 0.42, size * 0.42)
      ctx.fillStyle = color
    } else if (marker === 'dash') {
      ctx.fillStyle = accent
      ctx.fillRect(x, baseY - size * 0.28, size * 0.72, Math.max(1, size * 0.07))
      ctx.fillStyle = color
    } else {
      ctx.font = fontString(size * 0.82, 700, 'mono')
      ctx.fillStyle = accent
      ctx.fillText(String(index + 1).padStart(2, '0'), x, baseY)
      ctx.fillStyle = color
      ctx.font = fontString(size, 500, family)
    }
    let lineY = baseY
    for (const line of lines) {
      ctx.fillText(line, x + markerWidth, lineY, textWidth)
      lineY += lineHeight
    }
    cursor += lines.length * lineHeight + rowGap
    ctx.restore()
  })
  return cursor - y - rowGap
}

/** 未知指标的显示：明确写"未知"，不使用假数字 */
export function metricValue(metric: { value: string; known: boolean }): string {
  return metric.known && metric.value ? metric.value : '未知'
}

/** 当前有多少指标是用户真正勾选显示的（0 时模板应隐藏整个指标区） */
export function visibleMetricCount(design: DesignState): number {
  if (!design.metrics?.length) return 0
  const visible = design.metrics.filter((metric) => metric.visible)
  return visible.length
}

/**
 * 计算图片在给定矩形内的绘制参数，统一处理三种裁切方式：
 * - cover：居中填满（默认，适合已裁好的截图）
 * - top：按宽度铺满并贴顶（最接近浏览器第一屏的观感，适合整页截图）
 * - contain：完整显示，可能留边
 */
export function imageDrawParams(
  img: { width: number; height: number },
  w: number,
  h: number,
  treatment: 'cover' | 'top' | 'contain' = 'cover',
  zoom = 1,
  offsetX = 0,
  offsetY = 0
) {
  const safeZoom = Math.max(0.2, zoom)
  let scale: number
  if (treatment === 'contain') scale = Math.min(w / img.width, h / img.height) * safeZoom
  else if (treatment === 'top') scale = (w / img.width) * safeZoom
  else scale = Math.max(w / img.width, h / img.height) * safeZoom

  const dw = img.width * scale
  const dh = img.height * scale
  const dx = (w - dw) / 2 + offsetX * (w / 2)
  const dy = treatment === 'top' ? offsetY * (h / 2) : (h - dh) / 2 + offsetY * (h / 2)
  return { dx, dy, dw, dh }
}
