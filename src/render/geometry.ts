import type { RatioId } from '../types'

export interface ExportSize {
  width: number
  height: number
  label: string
  /** 设计坐标系宽度（渲染时按此比例缩放） */
  baseWidth: number
}

/**
 * 导出尺寸：设计坐标系固定为 1200 宽，导出按 1.5x / 2x 放大，保证文字与线条清晰。
 * 预览画布与导出使用同一套坐标，做到所见即所得。
 */
export const EXPORT_SIZES: Record<RatioId, ExportSize> = {
  '16:9': { width: 2400, height: 1350, label: '16:9 · 2400×1350', baseWidth: 1200 },
  '1:1': { width: 1800, height: 1800, label: '1:1 · 1800×1800', baseWidth: 1200 },
  '3:4': { width: 1800, height: 2400, label: '3:4 · 1800×2400', baseWidth: 1200 },
}

export interface Frame {
  ratio: RatioId
  /** 设计坐标系宽高 */
  width: number
  height: number
  /** 实际导出像素宽高 */
  exportWidth: number
  exportHeight: number
  /** 导出像素 / 设计坐标 */
  scale: number
  /** 安全内边距 */
  pad: number
  /** 竖版 / 方版 / 横版 */
  shape: 'landscape' | 'square' | 'portrait'
  /** 相对尺寸系数，便于按比例调字 */
  k: number
}

export function getFrame(ratio: RatioId): Frame {
  const size = EXPORT_SIZES[ratio]
  const width = size.baseWidth
  const height = Math.round((width * size.height) / size.width)
  const shape = ratio === '16:9' ? 'landscape' : ratio === '1:1' ? 'square' : 'portrait'
  return {
    ratio,
    width,
    height,
    exportWidth: size.width,
    exportHeight: size.height,
    scale: size.width / width,
    pad: Math.round(width * 0.06),
    shape,
    k: width / 1200,
  }
}

export const RATIO_LIST: { id: RatioId; label: string; hint: string }[] = [
  { id: '16:9', label: '16:9 横版', hint: '社交卡片 / README 头图' },
  { id: '1:1', label: '1:1 方图', hint: '信息流 / 九宫格' },
  { id: '3:4', label: '3:4 竖图', hint: '小红书 / 海报长图' },
]
