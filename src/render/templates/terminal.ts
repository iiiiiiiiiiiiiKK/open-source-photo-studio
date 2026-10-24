import type { TemplateContext, TemplateMeta } from './shared'
import { drawFooter, drawParagraph, drawTitleBlock, repoLine, visibleMetricCount } from './shared'
import { PALETTE, rgba, text, roundRect, hairline, dotGrid, metricsBand, paperGrain, measure } from '../primitives'
import { fontString, drawSpacedText, wrapText } from '../text'

const MONO = '"JetBrains Mono","Cascadia Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Microsoft YaHei",monospace'

interface TerminalLine {
  prompt?: string
  command: string
  output?: string[]
  accent?: boolean
}

function buildLines(c: TemplateContext): TerminalLine[] {
  const { project, design } = c
  const lines: TerminalLine[] = []
  const repo = repoLine(project).replace(/^https?:\/\/(www\.)?/, '') || design.title
  lines.push({ command: `git clone ${repo}.git`, output: [`Cloning into '${project?.name || 'project'}'...`] })

  const stack = design.techStack.length
    ? design.techStack.map((t) => t.name)
    : (project?.languages || []).map((l) => l.name)
  if (stack.length) {
    lines.push({ command: 'cat stack.txt', output: [stack.slice(0, 6).join('  ')] })
  }
  if (design.highlights.length) {
    lines.push({
      command: design.showHighlights ? 'cat highlights.md' : 'ls',
      output: design.showHighlights
        ? design.highlights.slice(0, 4).map((h, i) => `[${i + 1}] ${h}`)
        : undefined,
    })
  }
  if (design.showMetrics) {
    const known = design.metrics.filter((m) => m.known)
    if (known.length) {
      lines.push({
        command: 'gh repo view --json nameWithOwner,primaryLanguage,license',
        output: known.map((m) => `${m.label.toLowerCase().padEnd(10, '.')} ${m.value}`),
      })
    }
  }
  lines.push({ command: design.footer || `npm run build`, output: ['✓ build finished in 0.42s'], accent: true })
  return lines
}

/** 开发者终端风：等宽字体、命令与输出、荧光强调色 */
export const terminalTemplate: TemplateMeta = {
  id: 'terminal',
  name: '开发者终端风',
  tagline: '等宽字体与命令行叙事，极客感强',
  defaultBackground: '#0E1117',
  defaultAccent: '#5BE49B',
  needsScreenshot: false,
  render: (c) => {
    const { ctx, design, frame, images, project } = c
    const accent = design.accent
    const W = frame.width
    const H = frame.height
    const pad = frame.pad

    // 背景：深色 + 极细网格
    ctx.fillStyle = design.background
    ctx.fillRect(0, 0, W, H)
    dotGrid(ctx, 0, 0, W, H, { step: 28, radius: 0.9, color: '#FFFFFF', alpha: 0.03 + design.texture * 0.03 })

    const fg = '#E7E9EE'
    const dim = '#7A8296'
    const green = accent
    const amber = '#F2C14E'
    const red = '#E3675B'

    const isLandscape = frame.shape === 'landscape'
    const contentW = W - pad * 2
    let y = pad + 6

    // 状态栏
    ctx.save()
    ctx.font = fontString(12.5, 600, 'mono')
    ctx.fillStyle = rgba(green, 1)
    ctx.textAlign = 'left'
    drawSpacedText(ctx, '●', pad, y + 12, 0, 'left')
    ctx.fillStyle = dim
    drawSpacedText(ctx, ` ${project?.source === 'github' ? 'github' : 'web'}  ~/${(project?.name || 'project').toLowerCase()}`, pad + 14, y + 12, 0.3, 'left')
    ctx.textAlign = 'right'
    ctx.fillStyle = rgba(dim, 0.9)
    drawSpacedText(ctx, `zsh · 120×36   ${project?.license || 'license: unknown'}`, W - pad, y + 12, 0.2, 'right')
    ctx.restore()
    y += 30

    hairline(ctx, pad, y, contentW, rgba('#FFFFFF', 0.09), 1)
    y += isLandscape ? 26 : 22

    // 标题（等宽，紧凑）
    const titleBlock = drawTitleBlock(ctx, design.title, {
      x: pad,
      y,
      width: isLandscape ? contentW * 0.72 : contentW,
      maxHeight: isLandscape ? 130 : 180,
      size: (isLandscape ? 52 : 58) * design.titleScale,
      minSize: 26,
      color: fg,
      family: 'mono',
      weight: 700,
      lineHeightRatio: 1.14,
      maxLines: 2,
    })
    y += titleBlock.height + 14

    // 一句话
    const oneLiner = design.oneLiner || project?.description || ''
    if (oneLiner) {
      const h = drawParagraph(ctx, oneLiner, pad, y, isLandscape ? contentW * 0.62 : contentW, 78, {
        size: isLandscape ? 15.5 : 16.5,
        color: rgba(fg, 0.82),
        family: 'mono',
        lineHeightRatio: 1.7,
      })
      y += h + 16
    }

    // 终端窗口
    const bandH = design.showMetrics && visibleMetricCount(design) > 0 ? 74 : 0
    const winTop = y
    const winBottom = H - pad - bandH - 10
    const winH = Math.max(150, winBottom - winTop)
    const winX = pad
    const winW = contentW

    roundRect(ctx, winX, winTop, winW, winH, 12, rgba('#FFFFFF', 0.035), rgba('#FFFFFF', 0.11), 1)
    // 标题栏
    ctx.save()
    ctx.fillStyle = rgba('#FFFFFF', 0.05)
    roundRect(ctx, winX, winTop, winW, 34, 12, rgba('#FFFFFF', 0.05))
    ctx.fillStyle = rgba('#FFFFFF', 0.05)
    ctx.fillRect(winX, winTop + 20, winW, 14)
    ;[red, amber, '#63A96B'].forEach((color, index) => {
      ctx.beginPath()
      ctx.arc(winX + 20 + index * 18, winTop + 17, 4.6, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
    ctx.font = fontString(11.5, 500, 'mono')
    ctx.fillStyle = dim
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(repoLine(project).replace(/^https?:\/\/(www\.)?/, ''), winX + winW / 2, winTop + 17, winW - 160)
    ctx.restore()

    // 终端内容
    const lines = buildLines(c)
    const innerX = winX + 22
    const innerW = winW - 44
    let cy = winTop + 34 + 22
    const fontSize = isLandscape ? 14 : 15
    const lineH = fontSize * 1.72
    ctx.save()
    ctx.textBaseline = 'alphabetic'
    let stop = false
    for (const line of lines) {
      if (stop) break
      // 命令
      ctx.font = fontString(fontSize, 600, 'mono')
      ctx.fillStyle = rgba(green, 1)
      ctx.textAlign = 'left'
      const promptText = '$ '
      ctx.fillText(promptText, innerX, cy)
      const promptW = ctx.measureText(promptText).width
      ctx.fillStyle = fg
      const cmdLines = wrapText(ctx, line.command, { maxWidth: innerW - promptW, maxLines: 1 })
      ctx.fillText(cmdLines[0] || '', innerX + promptW, cy, innerW - promptW)
      cy += lineH
      for (const out of line.output || []) {
        if (cy > winTop + winH - 20) {
          stop = true
          break
        }
        ctx.font = fontString(fontSize * 0.94, 400, 'mono')
        ctx.fillStyle = line.accent ? rgba(green, 0.95) : rgba(dim, 1)
        const outLines = wrapText(ctx, out, { maxWidth: innerW - promptW, maxLines: 2 })
        for (const outLine of outLines) {
          ctx.fillText(outLine, innerX + promptW, cy, innerW - promptW)
          cy += lineH * 0.92
        }
      }
      cy += lineH * 0.28
      if (cy > winTop + winH - 34) stop = true
    }
    // 光标
    if (cy < winTop + winH - 24) {
      ctx.fillStyle = rgba(green, 0.9)
      ctx.fillRect(innerX, cy - fontSize * 0.72, fontSize * 0.52, fontSize * 1.05)
    }
    ctx.restore()

    // 指标条
    if (bandH) {
      const bandY = H - pad - bandH + 14
      hairline(ctx, pad, bandY - 16, contentW, rgba('#FFFFFF', 0.1), 1)
      metricsBand(
        ctx,
        pad,
        bandY,
        contentW,
        design.metrics.filter((m) => m.visible).map((m) => ({ label: m.label, value: m.known ? m.value : '未知', known: m.known })),
        { color: fg, mutedColor: dim, lineColor: rgba('#FFFFFF', 0.1), size: 25, labelSize: 10.5 }
      )
    } else {
      drawFooter(ctx, c, pad, H - pad + 2, contentW, { color: dim, size: 11 })
    }
  },
}





