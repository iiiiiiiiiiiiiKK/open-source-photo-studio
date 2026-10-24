import type { DesignState } from '../types'
import { loadImage, type LoadedImage } from './assets'
import { getTemplate, type TemplateImages } from './templates'
import { getFrame, type Frame } from './geometry'
import { fontString } from './text'

export interface RenderOptions {
  /** 只渲染到指定 canvas（用于预览） */
  canvas?: HTMLCanvasElement
  /** 导出时的实际像素宽度（默认按比例 2x） */
  exportScale?: number
  /** 收集图片加载失败信息 */
  onImageMiss?: (url: string, reason: string) => void
}

export interface RenderResult {
  canvas: HTMLCanvasElement
  frame: Frame
  images: TemplateImages
  missing: { url: string; reason: string }[]
}

function pickImageUrl(design: DesignState, projectImages: string[]): string | null {
  if (design.imageId) return design.imageId
  return projectImages[0] ?? null
}

/** 预加载模板需要的所有图片（主图、头像、图标、拼贴小图） */
export async function prepareImages(
  design: DesignState,
  projectImages: string[],
  extra: { avatar?: string; icon?: string } = {},
  onMiss?: (url: string, reason: string) => void
): Promise<TemplateImages> {
  const mainUrl = pickImageUrl(design, projectImages)
  const galleryUrls = projectImages.filter((url) => url !== mainUrl).slice(0, 3)

  const safeLoad = async (url?: string | null): Promise<LoadedImage | null> => {
    if (!url) return null
    try {
      return await loadImage(url)
    } catch (error) {
      onMiss?.(url, error instanceof Error ? error.message : '图片加载失败')
      return null
    }
  }

  const [main, avatar, icon, ...gallery] = await Promise.all([
    safeLoad(mainUrl),
    safeLoad(extra.avatar),
    safeLoad(extra.icon),
    ...galleryUrls.map((url) => safeLoad(url)),
  ])

  return {
    main: main?.image ?? null,
    avatar: avatar?.image ?? null,
    icon: icon?.image ?? null,
    gallery: gallery.map((g) => g?.image).filter((img): img is HTMLImageElement => Boolean(img)),
  }
}

/**
 * 布局审计钩子：当 window.__OSS_TEXT_LOG__ 是数组时，拦截 fillText 记录每段文字的位置
 * （设计坐标，未经导出缩放），供 scripts/layout-audit.mjs 检查文字是否越出版面。
 * 生产环境不设置该变量，无额外开销。
 */
function instrumentText(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const log = (globalThis as unknown as { __OSS_TEXT_LOG__?: unknown[] }).__OSS_TEXT_LOG__
  if (!Array.isArray(log)) return ctx
  const original = ctx.fillText.bind(ctx)
  const patched = function (this: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth?: number) {
    try {
      const width = ctx.measureText(value).width
      const align = ctx.textAlign
      const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x
      const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(ctx.font)
      const size = sizeMatch ? parseFloat(sizeMatch[1]) : 16
      log.push({
        text: String(value).slice(0, 48),
        left: Math.round(left),
        right: Math.round(left + width),
        top: Math.round(y - size),
        bottom: Math.round(y + size * 0.3),
        font: ctx.font,
      })
    } catch {
      /* 审计失败不影响渲染 */
    }
    return original(value, x, y, maxWidth)
  }
  ;(ctx as unknown as { fillText: typeof patched }).fillText = patched as unknown as typeof ctx.fillText
  return ctx
}

/** 创建离屏画布并按导出倍率渲染，返回真实像素尺寸的 canvas（可直接导出） */
export async function renderDesign(
  design: DesignState,
  projectImages: string[],
  extra: { avatar?: string; icon?: string; project?: import('../types').ProjectInfo | null },
  options: RenderOptions = {}
): Promise<RenderResult> {
  const frame = getFrame(design.ratio)
  const scale = options.exportScale ?? frame.scale
  const missing: { url: string; reason: string }[] = []

  const images = await prepareImages(design, projectImages, extra, (url, reason) => {
    missing.push({ url, reason })
    options.onImageMiss?.(url, reason)
  })

  const canvas = options.canvas ?? document.createElement('canvas')
  canvas.width = Math.round(frame.width * scale)
  canvas.height = Math.round(frame.height * scale)
  const raw = canvas.getContext('2d', { alpha: false })
  if (!raw) throw new Error('无法创建画布上下文')
  const ctx = instrumentText(raw)

  ctx.save()
  ctx.scale(scale, scale)
  ctx.textRendering = 'geometricPrecision'
  ctx.fillStyle = design.background
  ctx.fillRect(0, 0, frame.width, frame.height)

  const template = getTemplate(design.template)
  const baseFont = fontString(16, 400, design.font === 'serif' ? 'serif' : design.font)
  ctx.font = baseFont

  try {
    template.render({
      ctx,
      design,
      project: extra.project ?? null,
      frame,
      images,
    })
  } finally {
    ctx.restore()
  }

  return { canvas, frame, images, missing }
}

/** 导出 PNG Blob（优先使用 PNG 无损） */
export async function renderToPngBlob(
  design: DesignState,
  projectImages: string[],
  extra: { avatar?: string; icon?: string; project?: import('../types').ProjectInfo | null },
  exportScale?: number
): Promise<{ blob: Blob; canvas: HTMLCanvasElement; frame: Frame }> {
  const { canvas, frame } = await renderDesign(design, projectImages, extra, { exportScale })
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('PNG 导出失败'))
    }, 'image/png')
  })
  return { blob, canvas, frame }
}

/** 预览社交平台效果的缩略渲染（较小倍率，加快重绘） */
export async function renderPreview(
  design: DesignState,
  projectImages: string[],
  extra: { avatar?: string; icon?: string; project?: import('../types').ProjectInfo | null },
  targetWidth: number
): Promise<RenderResult> {
  const frame = getFrame(design.ratio)
  const scale = targetWidth / frame.width
  return renderDesign(design, projectImages, extra, { exportScale: scale })
}
