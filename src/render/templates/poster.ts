import type { TemplateContext, TemplateMeta } from './shared'
import { drawFooter, drawParagraph, drawTitleBlock, repoLine, visibleMetricCount, imageDrawParams } from './shared'
import { PALETTE, rgba, text, roundRect, hairline, paperGrain, measure, mix, readableOn } from '../primitives'
import { fontString, drawSpacedText } from '../text'

/** 产品发布海报：大色块、超大标题、版本徽标，适合官宣 */
export const posterTemplate: TemplateMeta = {
  id: 'poster',
  name: '产品发布海报',
  tagline: '大标题 + 版本徽标，适合发布公告',
  defaultBackground: '#111318',
  defaultAccent: '#F4C95D',
  needsScreenshot: false,
  render: (c) => {
    const { ctx, design, frame, images, project } = c
    const accent = design.accent
    const bg = design.background
    const W = frame.width
    const H = frame.height
    const pad = Math.round(W * 0.07)
    const contentW = W - pad * 2
    const dark = readableOn(bg) === '#FFFFFF'
    const ink = dark ? '#F5F5F2' : '#141519'
    const soft = dark ? 'rgba(245,245,242,0.78)' : 'rgba(20,21,25,0.74)'
    const muted = dark ? 'rgba(245,245,242,0.5)' : 'rgba(20,21,25,0.5)'
    const isLandscape = frame.shape === 'landscape'
    const isPortrait = frame.shape === 'portrait'

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    paperGrain(ctx, W, H, { alpha: 0.02 + design.texture * 0.04, density: 0.00035, color: dark ? '#FFFFFF' : '#000000' })

    // 背景大圆环：用强调色画出产品感，但不是渐变卡片
    ctx.save()
    const ringX = isLandscape ? W * 0.82 : W * 0.78
    const ringY = isLandscape ? H * 0.52 : H * 0.36
    const ringR = isLandscape ? H * 0.52 : W * 0.62
    ctx.strokeStyle = rgba(accent, 0.16)
    ctx.lineWidth = Math.max(1, W * 0.0035)
    ctx.beginPath()
    ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = rgba(accent, 0.1)
    ctx.beginPath()
    ctx.arc(ringX, ringY, ringR * 0.72, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    // 顶部：徽标 + 版本
    let y = pad
    ctx.save()
    ctx.font = fontString(12, 700, 'sans')
    const badgeText = (design.badge || (project?.latestRelease?.tag ? `RELEASE ${project.latestRelease.tag}` : 'NEW RELEASE')).toUpperCase()
    const badgeW = ctx.measureText(badgeText).width + 34
    roundRect(ctx, pad, y, badgeW, 30, 15, accent)
    ctx.fillStyle = readableOn(accent, '#141519', '#FFFFFF')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badgeText, pad + badgeW / 2, y + 15.5)
    ctx.restore()

    // 右上：项目标识
    if (project?.owner) {
      text(ctx, `@${project.owner}`, W - pad, y + 20, { size: 12.5, weight: 600, color: muted, align: 'right', tracking: 1 })
    }
    y += isLandscape ? 52 : 60

    // 超大标题
    const titleSize = (isPortrait ? 112 : isLandscape ? 96 : 100) * design.titleScale
    const titleBlock = drawTitleBlock(ctx, design.title, {
      x: pad,
      y,
      width: isLandscape ? contentW * 0.68 : contentW,
      maxHeight: isPortrait ? 300 : isLandscape ? 230 : 260,
      size: titleSize,
      minSize: 40,
      color: ink,
      family: design.font === 'serif' ? 'serif' : design.font,
      weight: design.font === 'serif' ? 600 : 800,
      lineHeightRatio: 1.0,
      maxLines: isPortrait ? 3 : 2,
    })
    y += titleBlock.height + 10

    // 版本号大字
    if (project?.latestRelease?.tag) {
      text(ctx, project.latestRelease.tag, pad, y + 18, {
        size: 20,
        weight: 700,
        color: accent,
        family: 'mono',
        tracking: 1.6,
      })
      y += 34
    } else if (design.subtitle) {
      text(ctx, design.subtitle, pad, y + 16, { size: 15, weight: 500, color: accent, tracking: 0.6 })
      y += 30
    }

    // 一句话
    const oneLiner = design.oneLiner || project?.description || ''
    if (oneLiner) {
      const h = drawParagraph(ctx, oneLiner, pad, y, isLandscape ? contentW * 0.56 : contentW, 100, {
        size: isLandscape ? 18 : 19,
        color: soft,
        family: design.font === 'serif' ? 'serif' : 'sans',
        lineHeightRatio: 1.62,
      })
      y += h + 18
    }

    // 中部：截图 or 亮点
    const footerH = design.showMetrics && visibleMetricCount(design) > 0 ? 84 : 30
    const bottom = H - pad - footerH
    if (isLandscape) {
      const shotX = pad + contentW * 0.62
      const shotW = W - pad - shotX
      const shotH = Math.min(bottom - pad - 30, shotW * 0.66)
      const shotY = H - pad - footerH - shotH - 10
      if (images.main) {
        ctx.save()
        roundRect(ctx, shotX, shotY, shotW, shotH, 10, undefined, undefined)
        ctx.clip()
        const params = imageDrawParams(images.main, shotW, shotH, design.imageTreatment, design.imageZoom, design.imageOffsetX, design.imageOffsetY)
        if (design.imageTreatment === 'contain') {
          ctx.fillStyle = bg
          ctx.fillRect(shotX, shotY, shotW, shotH)
        }
        ctx.drawImage(images.main, shotX + params.dx, shotY + params.dy, params.dw, params.dh)
        ctx.restore()
        roundRect(ctx, shotX, shotY, shotW, shotH, 10, undefined, rgba(ink, 0.18), 1)
      }
      // 亮点竖排
      if (design.showHighlights && design.highlights.length) {
        let hy = y + 6
        design.highlights.slice(0, 3).forEach((item, index) => {
          const rowW = contentW * 0.54
          ctx.save()
          ctx.fillStyle = rgba(accent, 0.9)
          ctx.fillRect(pad, hy + 2, 14, 2)
          ctx.restore()
          const h = drawParagraph(ctx, item, pad + 24, hy - 8, rowW - 24, 52, {
            size: 15,
            color: soft,
            family: 'sans',
            lineHeightRatio: 1.6,
          })
          hy += Math.max(40, h + 12)
        })
      }
    } else {
      // 方图 / 竖图：标题 → 一句话 → 截图 → 亮点
      const highlightsH = design.showHighlights ? Math.min(design.highlights.length, isPortrait ? 3 : 2) * 46 : 0
      const shotTop = y + 6
      const shotBottom = bottom - highlightsH - 14
      const shotH = Math.max(110, shotBottom - shotTop)
      if (images.main) {
        ctx.save()
        roundRect(ctx, pad, shotTop, contentW, shotH, 12, undefined, undefined)
        ctx.clip()
        const params = imageDrawParams(images.main, contentW, shotH, design.imageTreatment, design.imageZoom, design.imageOffsetX, design.imageOffsetY)
        if (design.imageTreatment === 'contain') {
          ctx.fillStyle = bg
          ctx.fillRect(pad, shotTop, contentW, shotH)
        }
        ctx.drawImage(images.main, pad + params.dx, shotTop + params.dy, params.dw, params.dh)
        ctx.restore()
        roundRect(ctx, pad, shotTop, contentW, shotH, 12, undefined, rgba(ink, 0.16), 1)
      }
      if (design.showHighlights && design.highlights.length) {
        let hy = shotTop + shotH + 26
        design.highlights.slice(0, isPortrait ? 3 : 2).forEach((item) => {
          ctx.save()
          ctx.fillStyle = accent
          ctx.beginPath()
          ctx.arc(pad + 4, hy + 4, 2.6, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          const h = drawParagraph(ctx, item, pad + 20, hy - 10, contentW - 20, 44, {
            size: 14.5,
            color: soft,
            family: 'sans',
            lineHeightRatio: 1.5,
          })
          hy += Math.max(36, h + 10)
        })
      }
    }

    // 底部指标 / 页脚
    if (design.showMetrics && visibleMetricCount(design) > 0) {
      const bandY = H - pad - 58
      hairline(ctx, pad, bandY - 18, contentW, rgba(ink, 0.18), 1)
      const visible = design.metrics.filter((m) => m.visible).slice(0, 4)
      const colW = contentW / Math.max(1, visible.length)
      visible.forEach((metric, index) => {
        const mx = pad + colW * index
        text(ctx, metric.known ? metric.value : '未知', mx, bandY + 24, {
          size: 26,
          weight: 700,
          color: metric.known ? ink : muted,
          family: 'sans',
        })
        text(ctx, metric.label.toUpperCase(), mx, bandY + 46, { size: 10, weight: 600, color: muted, tracking: 1.6 })
      })
    } else {
      drawFooter(ctx, c, pad, H - pad, contentW, { color: muted, size: 11 })
    }
  },
}



