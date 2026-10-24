import type { TemplateContext, TemplateMeta } from './shared'
import { drawFooter, drawParagraph, drawTitleBlock, repoLine } from './shared'
import { PALETTE, rgba, text, roundRect, hairline, dotGrid, measure, mix, luminance } from '../primitives'
import { fontString, drawSpacedText, wrapText } from '../text'

interface LayoutNode {
  label: string
  values: string[]
  lane: number
}

/** 把技术栈 / 指标组织成"分层架构"的视觉结构（纯展示用，不虚构模块关系） */
function buildLayers(c: TemplateContext): LayoutNode[][] {
  const { design, project } = c
  const languages = (project?.languages || []).slice(0, 3).map((l) => `${l.name} ${Math.round(l.percent)}%`)
  const topics = (design.tags.length ? design.tags : project?.topics || []).slice(0, 4)
  const tech = design.techStack.slice(0, 4).map((t) => (t.note ? `${t.name} · ${t.note}` : t.name))

  const layers: LayoutNode[][] = []

  const entry: LayoutNode[] = []
  if (project?.homepage || project?.url) {
    entry.push({ label: '访问入口', values: [String(project.homepage || project.url).replace(/^https?:\/\//, '')], lane: 0 })
  }
  if (project?.latestRelease?.tag) {
    entry.push({ label: '发布版本', values: [project.latestRelease.tag], lane: 1 })
  }
  if (!entry.length && project?.host) {
    entry.push({ label: '站点', values: [project.host], lane: 0 })
  }
  if (entry.length) layers.push(entry)

  if (tech.length) layers.push([{ label: '技术栈', values: tech, lane: 0 }])
  if (languages.length) layers.push([{ label: '语言构成', values: languages, lane: 0 }])
  if (topics.length) layers.push([{ label: '能力标签', values: topics, lane: 0 }])

  const metricLayer: string[] = []
  if (project?.license) metricLayer.push(`许可 ${project.license}`)
  if (typeof project?.stars === 'number') metricLayer.push(`Star ${project.stars}`)
  if (typeof project?.forks === 'number') metricLayer.push(`Fork ${project.forks}`)
  if (project?.createdAt) metricLayer.push(`创建 ${project.createdAt.slice(0, 10)}`)
  if (metricLayer.length) layers.push([{ label: '项目指标', values: metricLayer.slice(0, 4), lane: 0 }])

  return layers.slice(0, 5)
}

/** 技术架构介绍图：分层色块 + 标签，像系统设计图 */
export const architectureTemplate: TemplateMeta = {
  id: 'architecture',
  name: '技术架构介绍图',
  tagline: '分层示意图，适合讲清技术组成',
  defaultBackground: '#F2F4F7',
  defaultAccent: '#2F6BFF',
  needsScreenshot: false,
  render: (c) => {
    const { ctx, design, frame, project } = c
    const accent = design.accent
    const W = frame.width
    const H = frame.height
    const pad = Math.round(W * 0.06)
    const contentW = W - pad * 2
    const dark = luminance(design.background) < 0.35
    const ink = dark ? '#EDEFF5' : '#14161C'
    const soft = dark ? 'rgba(237,239,245,0.76)' : 'rgba(20,22,28,0.72)'
    const muted = dark ? 'rgba(237,239,245,0.5)' : 'rgba(20,22,28,0.5)'
    const line = dark ? 'rgba(255,255,255,0.13)' : 'rgba(20,22,28,0.12)'
    const isLandscape = frame.shape === 'landscape'
    const isPortrait = frame.shape === 'portrait'

    // 背景：浅色 + 网格（工程图纸感）
    ctx.fillStyle = design.background
    ctx.fillRect(0, 0, W, H)
    const step = 32
    ctx.save()
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(20,22,28,0.05)'
    ctx.lineWidth = 1
    for (let gx = pad; gx <= W - pad; gx += step) {
      ctx.beginPath()
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, H)
      ctx.stroke()
    }
    for (let gy = 0; gy <= H; gy += step) {
      ctx.beginPath()
      ctx.moveTo(0, gy)
      ctx.lineTo(W, gy)
      ctx.stroke()
    }
    ctx.restore()

    let y = pad
    // 头部
    ctx.save()
    ctx.font = fontString(11.5, 700, 'mono')
    ctx.fillStyle = accent
    drawSpacedText(ctx, 'ARCHITECTURE OVERVIEW', pad, y + 10, 1.8, 'left')
    ctx.textAlign = 'right'
    ctx.fillStyle = muted
    ctx.font = fontString(11.5, 500, 'mono')
    ctx.fillText(repoLine(project).replace(/^https?:\/\/(www\.)?/, ''), W - pad, y + 10, contentW * 0.55)
    ctx.restore()
    y += 26
    hairline(ctx, pad, y, contentW, line, 1)
    y += isLandscape ? 22 : 20

    const titleBlock = drawTitleBlock(ctx, design.title, {
      x: pad,
      y,
      width: isLandscape ? contentW * 0.62 : contentW,
      maxHeight: isLandscape ? 110 : 150,
      size: (isLandscape ? 48 : 54) * design.titleScale,
      minSize: 26,
      color: ink,
      family: design.font === 'serif' ? 'serif' : design.font,
      weight: 700,
      lineHeightRatio: 1.08,
      maxLines: 2,
    })
    y += titleBlock.height + 8

    const oneLiner = design.oneLiner || project?.description || ''
    if (oneLiner) {
      const h = drawParagraph(ctx, oneLiner, pad, y, isLandscape ? contentW * 0.54 : contentW * 0.9, 60, {
        size: 14,
        color: soft,
        family: 'sans',
        lineHeightRatio: 1.6,
      })
      y += h + 10
    }

    // 架构分层
    const layers = buildLayers(c)
    const footerH = 26
    const diagramTop = y + 18
    const diagramBottom = H - pad - footerH - 6
    const diagramH = Math.max(150, diagramBottom - diagramTop)
    const layerCount = Math.max(1, layers.length)
    const gap = Math.max(10, diagramH * 0.035)
    const layerH = (diagramH - gap * (layerCount - 1)) / layerCount

    layers.forEach((layer, layerIndex) => {
      const ly = diagramTop + layerIndex * (layerH + gap)
      const node = layer[0]
      // 分层底板
      roundRect(ctx, pad, ly, contentW, layerH, 8, dark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.72)', line, 1)
      // 左侧标签条
      ctx.save()
      ctx.fillStyle = rgba(accent, 0.9)
      ctx.fillRect(pad, ly + 8, 3, layerH - 16)
      ctx.restore()

      const labelW = Math.min(140, contentW * 0.16)
      text(ctx, node.label, pad + 18, ly + layerH / 2 + 4, {
        size: 12,
        weight: 700,
        color: accent,
        family: 'sans',
        tracking: 0.8,
      })

      // 右侧 chips
      const chipsX = pad + labelW + 12
      const chipsW = contentW - labelW - 26
      const chipH = Math.min(34, Math.max(20, layerH * 0.5))
      const chipGap = 8
      let cx = chipsX
      let cy = ly + (layerH - chipH) / 2
      ctx.save()
      for (const value of node.values) {
        ctx.font = fontString(chipH * 0.42, 600, 'mono')
        const textW = ctx.measureText(value).width
        const chipW = Math.min(textW + 24, chipsW)
        if (cx + chipW > chipsX + chipsW + 1) {
          cx = chipsX
          cy += chipH + chipGap
          if (cy + chipH > ly + layerH - 4) break
        }
        roundRect(ctx, cx, cy, chipW, chipH, chipH / 2, dark ? 'rgba(255,255,255,0.08)' : '#FFFFFF', line, 1)
        ctx.fillStyle = ink
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(value, cx + 12, cy + chipH / 2 + 0.5, chipW - 20)
        cx += chipW + chipGap
      }
      ctx.restore()
    })

    // 底部：连接线装饰 + 页脚
    ctx.save()
    ctx.strokeStyle = rgba(accent, 0.35)
    ctx.lineWidth = 1
    ctx.setLineDash([4, 5])
    const midX = pad + contentW / 2
    ctx.beginPath()
    ctx.moveTo(midX, diagramTop - 12)
    ctx.lineTo(midX, diagramBottom + 4)
    ctx.stroke()
    ctx.restore()

    drawFooter(ctx, c, pad, H - pad, contentW, { color: muted, size: 10.5 })
  },
}

