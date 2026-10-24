// 画布文本工具：中英混排断行、省略号截断、自动缩放适配。
// 中文按字断行，英文/数字按词断行，避免把单词劈成两半。

export const FONT_STACKS = {
  sans:
    '"PingFang SC","Microsoft YaHei","Noto Sans SC","Source Han Sans SC","Hiragino Sans GB",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  serif:
    '"Songti SC","Noto Serif SC","Source Han Serif SC","Times New Roman",Georgia,"SimSun",serif',
  mono:
    '"JetBrains Mono","Cascadia Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Microsoft YaHei",monospace',
  rounded:
    '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,"Segoe UI",Roboto,sans-serif',
} as const

export type FontKey = keyof typeof FONT_STACKS

export function fontString(size: number, weight: number | string, family: FontKey): string {
  return `${weight} ${Math.max(1, Math.round(size))}px ${FONT_STACKS[family]}`
}

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uff60\uffe0-\uffe6]/
const NO_LINE_START = /[，。、；：？！）】》」』”’%…—,.;:!?)\]}]/
const NO_LINE_END = /[（【《「『“‘(\[{]/

type Token = { text: string; space: boolean }

/** 把文本切成断行单位 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let buffer = ''
  const flush = () => {
    if (buffer) {
      tokens.push({ text: buffer, space: false })
      buffer = ''
    }
  }
  for (const char of text) {
    if (char === '\n') {
      flush()
      tokens.push({ text: '\n', space: true })
      continue
    }
    if (char === ' ' || char === '\t') {
      flush()
      tokens.push({ text: ' ', space: true })
      continue
    }
    if (CJK.test(char)) {
      flush()
      tokens.push({ text: char, space: false })
      continue
    }
    if (/[A-Za-z0-9@#$&*+\-/._'"]/.test(char)) {
      buffer += char
      continue
    }
    // 其他标点作为独立 token
    flush()
    tokens.push({ text: char, space: false })
  }
  flush()
  return tokens
}

export interface WrapOptions {
  maxWidth: number
  maxLines?: number
  ellipsis?: string
}

/** 断行，超出 maxLines 时在末行加省略号 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, options: WrapOptions): string[] {
  const { maxWidth, maxLines = Number.MAX_SAFE_INTEGER, ellipsis = '…' } = options
  const clean = String(text ?? '').replace(/\r/g, '')
  if (!clean.trim()) return []
  const tokens = tokenize(clean)
  const lines: string[] = []
  let current = ''

  const pushLine = () => {
    lines.push(current.trimEnd())
    current = ''
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.text === '\n') {
      pushLine()
      if (lines.length >= maxLines) break
      continue
    }
    const candidate = current + token.text
    if (ctx.measureText(candidate).width <= maxWidth || current === '') {
      current = candidate
      continue
    }
    // 需要换行；避免标点出现在行首
    if (!token.space && NO_LINE_START.test(token.text) && current.length > 0) {
      current = candidate
      pushLine()
      if (lines.length >= maxLines) break
      continue
    }
    // 避免开括号留在行尾
    let carry = ''
    if (current.length > 1 && NO_LINE_END.test(current[current.length - 1])) {
      carry = current[current.length - 1]
      current = current.slice(0, -1)
    }
    pushLine()
    if (lines.length >= maxLines) break
    current = carry + (token.space ? '' : token.text)
  }
  if (lines.length < maxLines && current.trim()) lines.push(current.trimEnd())

  if (lines.length > maxLines) lines.length = maxLines

  // 检查是否有被丢弃的内容 —— 末行需要省略号
  const consumed = lines.join('').replace(/\s/g, '').length
  const total = clean.replace(/\s/g, '').length
  if (consumed < total && lines.length > 0) {
    let last = lines[lines.length - 1]
    while (last.length > 1 && ctx.measureText(last + ellipsis).width > maxWidth) {
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = last.replace(/[\s，。、；：,.;:]+$/, '') + ellipsis
  }
  return lines
}

export interface FittedText {
  lines: string[]
  fontSize: number
  lineHeight: number
}

/** 在给定尺寸内自动缩小字号，保证文字不溢出 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    maxWidth: number
    maxHeight: number
    fontFamily: FontKey
    weight: number | string
    preferred: number
    minSize: number
    lineHeightRatio?: number
    maxLines?: number
    letterSpacing?: number
  }
): FittedText {
  const {
    maxWidth,
    maxHeight,
    fontFamily,
    weight,
    preferred,
    minSize,
    lineHeightRatio = 1.28,
    maxLines = 6,
  } = options
  let size = preferred
  let best: FittedText = { lines: [], fontSize: size, lineHeight: size * lineHeightRatio }
  while (size >= minSize) {
    ctx.font = fontString(size, weight, fontFamily)
    const lineHeight = size * lineHeightRatio
    const maxByHeight = Math.max(1, Math.floor(maxHeight / lineHeight))
    const limit = Math.min(maxLines, maxByHeight)
    const lines = wrapText(ctx, text, { maxWidth, maxLines: limit })
    const height = lines.length * lineHeight
    best = { lines, fontSize: size, lineHeight }
    const fullLength = String(text ?? '').replace(/\s/g, '').length
    const rendered = lines.join('').replace(/\s/g, '').length + (lines.some((l) => l.includes('…')) ? 1 : 0)
    if (height <= maxHeight && rendered >= Math.min(fullLength, 1)) {
      if (rendered >= fullLength || limit >= Math.ceil(fullLength / 12)) return best
    }
    if (height <= maxHeight && lines.length <= limit) {
      // 能完整放下（或已被省略号标记）就采用
      return best
    }
    size -= Math.max(1, Math.round(size * 0.04))
  }
  return best
}

export function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  align: CanvasTextAlign = 'left',
  maxWidth?: number
): number {
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  let cursor = y
  for (const line of lines) {
    ctx.fillText(line, x, cursor, maxWidth)
    cursor += lineHeight
  }
  return cursor
}

/** 带字距的小号标签文字（让标题更精细，但字距需要手动画） */
export function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'right' | 'center' = 'left'
): number {
  const chars = [...text]
  let total = 0
  for (const char of chars) total += ctx.measureText(char).width + spacing
  total -= spacing
  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  for (const char of chars) {
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + spacing
  }
  ctx.textAlign = prevAlign
  return total
}

export function measureSpacedText(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  const chars = [...text]
  let total = 0
  for (const char of chars) total += ctx.measureText(char).width + spacing
  return total - spacing
}
