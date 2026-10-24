import type { TemplateContext, TemplateMeta } from './shared'
import { drawFooter, drawHighlights, drawParagraph, drawTitleBlock, repoLine, dateStamp, visibleMetricCount, imageDrawParams } from './shared'
import { PALETTE, rgba, text, roundRect, hairline, paperGrain, measure, mix, luminance } from '../primitives'
import { fontString, drawSpacedText } from '../text'

/** 极简编辑部风：留白、衬线大标题、编号小节、细分割线 */
export const editorialTemplate: TemplateMeta = {
  id: 'editorial',
  name: '极简编辑部风',
  tagline: '杂志式排版，衬线标题与大量留白',
  defaultBackground: '#F7F5EF',
  defaultAccent: '#1F3A2E',
  needsScreenshot: false,
  render: (c) => {
    const { ctx, design, frame, images, project } = c
    const accent = design.accent
    const W = frame.width
    const H = frame.height
    const pad = Math.round(frame.width * 0.075)
    const contentW = W - pad * 2
    const dark = luminance(design.background) < 0.35

    ctx.fillStyle = design.background
    ctx.fillRect(0, 0, W, H)
    paperGrain(ctx, W, H, { alpha: 0.02 + design.texture * 0.045, density: 0.00032, color: '#20180E' })

    const ink = dark ? '#EDEAE2' : '#16171B'
    const soft = dark ? '#B4B3AB' : '#3D3E42'
    const muted = dark ? '#8C8B84' : '#7C7A73'
    const rule = dark ? 'rgba(255,255,255,0.16)' : 'rgba(20,18,14,0.16)'
    const num = dark ? 'rgba(255,255,255,0.28)' : 'rgba(20,18,14,0.3)'

    const isLandscape = frame.shape === 'landscape'
    const isPortrait = frame.shape === 'portrait'

    // 刊头
    let y = pad
    ctx.save()
    ctx.font = fontString(11, 600, 'serif')
    ctx.fillStyle = muted
    drawSpacedText(ctx, '开源项目照相馆 · 项目特写', pad, y + 10, 2.2, 'left')
    ctx.textAlign = 'right'
    const issueLabel = (project?.source === 'github' ? 'ISSUE' : 'FEATURE') + ' · ' + (dateStamp(project) || '')
    drawSpacedText(ctx, issueLabel.toUpperCase(), W - pad, y + 10, 1.8, 'right')
    ctx.restore()
    y += 26
    hairline(ctx, pad, y, contentW, rule, 1)
    y += isLandscape ? 34 : 30

    // 大标题（衬线）
    const titleSize = (isPortrait ? 92 : isLandscape ? 76 : 82) * design.titleScale
    const titleBlock = drawTitleBlock(ctx, design.title, {
      x: pad,
      y,
      width: isLandscape ? contentW * 0.78 : contentW,
      maxHeight: isPortrait ? 260 : isLandscape ? 200 : 220,
      size: titleSize,
      minSize: 36,
      color: ink,
      family: 'serif',
      weight: 600,
      lineHeightRatio: 1.04,
      maxLines: isPortrait ? 3 : 2,
    })
    y += titleBlock.height + 16

    // 副题 / 一句话，衬线斜体感
    const oneLiner = design.oneLiner || project?.description || ''
    if (oneLiner) {
      // 首字下沉式引导
      ctx.save()
      ctx.font = fontString(isLandscape ? 18 : 19, 500, 'serif')
      ctx.fillStyle = accent
      ctx.fillText('—', pad, y + 4)
      ctx.restore()
      const h = drawParagraph(ctx, oneLiner, pad + 26, y - 12, isLandscape ? contentW * 0.66 : contentW - 26, isPortrait ? 130 : 100, {
        size: isLandscape ? 17.5 : 18.5,
        color: soft,
        family: 'serif',
        weight: 400,
        lineHeightRatio: 1.72,
      })
      y += h + 20
    }

    if (design.subtitle) {
      text(ctx, design.subtitle, pad, y, { size: 12.5, weight: 600, color: muted, family: 'sans', tracking: 1.1 })
      y += 22
    }

    hairline(ctx, pad, y, contentW, rule, 1)
    y += 26

    // 中部：左栏亮点，右栏截图/栏目信息
    const columnsTop = y
    const footerH = design.showMetrics && visibleMetricCount(design) > 0 ? 74 : 28
    const columnsBottom = H - pad - footerH - 18
    const columnsH = Math.max(140, columnsBottom - columnsTop)

    if (isLandscape) {
      const leftW = contentW * 0.52
      const rightX = pad + leftW + 44
      const rightW = contentW - leftW - 44

      // 左：编号亮点
      if (design.showHighlights && design.highlights.length) {
        let hy = columnsTop
        design.highlights.slice(0, 4).forEach((item, index) => {
          ctx.save()
          ctx.font = fontString(11, 700, 'mono')
          ctx.fillStyle = num
          ctx.fillText(String(index + 1).padStart(2, '0'), pad, hy + 12)
          ctx.restore()
          const h = drawParagraph(ctx, item, pad + 34, hy - 4, leftW - 34, 62, {
            size: 14.5,
            color: ink,
            family: 'sans',
            lineHeightRatio: 1.6,
          })
          hy += Math.max(46, h + 16)
          if (hy > columnsTop + columnsH - 40) return
        })
      } else if (design.body) {
        drawParagraph(ctx, design.body, pad, columnsTop - 2, leftW, columnsH, {
          size: 14.5,
          color: soft,
          family: 'sans',
          lineHeightRatio: 1.75,
        })
      }

      // 右：截图或竖排信息
      if (images.main) {
        const imgH = Math.min(columnsH, rightW * 0.72)
        ctx.save()
        ctx.fillStyle = rgba(ink, 0.06)
        ctx.fillRect(rightX - 10, columnsTop - 10, rightW + 20, imgH + 20)
        ctx.restore()
        ctx.save()
        ctx.beginPath()
        ctx.rect(rightX, columnsTop, rightW, imgH)
        ctx.clip()
        const params = imageDrawParams(images.main, rightW, imgH, design.imageTreatment, design.imageZoom, design.imageOffsetX, design.imageOffsetY)
        if (design.imageTreatment === 'contain') {
          ctx.fillStyle = design.background
          ctx.fillRect(rightX, columnsTop, rightW, imgH)
        }
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(images.main, rightX + params.dx, columnsTop + params.dy, params.dw, params.dh)
        ctx.restore()
        text(ctx, 'FIG. 01 — 项目首页实拍', rightX, columnsTop + imgH + 26, { size: 10.5, weight: 600, color: muted, tracking: 1.4 })
      } else {
        // 竖排栏目
        const infoTop = columnsTop
        text(ctx, '项目信息', rightX, infoTop + 12, { size: 11, weight: 700, color: accent, tracking: 2 })
        hairline(ctx, rightX, infoTop + 24, rightW, rule, 1)
        let iy = infoTop + 52
        const rows: [string, string][] = []
        if (project?.owner) rows.push(['作者', project.owner])
        if (project?.language) rows.push(['主要语言', project.language])
        if (project?.license) rows.push(['许可协议', project.license])
        if (project?.latestRelease?.tag) rows.push(['最新版本', project.latestRelease.tag])
        if (project?.host) rows.push(['站点', project.host])
        for (const [label, value] of rows.slice(0, 5)) {
          text(ctx, label, rightX, iy, { size: 11, weight: 600, color: muted, tracking: 1 })
          text(ctx, value, rightX + rightW, iy, { size: 13.5, weight: 500, color: ink, align: 'right', family: 'serif', maxWidth: rightW * 0.68 })
          iy += 30
          hairline(ctx, rightX, iy - 12, rightW, rule, 0.6)
        }
      }
    } else {
      // 方图 / 竖图：纵向流式排版
      let by = columnsTop
      if (design.showHighlights && design.highlights.length) {
        design.highlights.slice(0, isPortrait ? 4 : 3).forEach((item, index) => {
          if (by > columnsTop + columnsH * 0.52) return
          ctx.save()
          ctx.font = fontString(11, 700, 'mono')
          ctx.fillStyle = num
          ctx.fillText(String(index + 1).padStart(2, '0'), pad, by + 12)
          ctx.restore()
          const h = drawParagraph(ctx, item, pad + 34, by - 4, contentW - 34, 62, {
            size: 15,
            color: ink,
            family: 'sans',
            lineHeightRatio: 1.6,
          })
          by += Math.max(48, h + 18)
        })
      }
      by += 8
      const imgTop = by
      const imgH = Math.max(120, H - pad - footerH - 16 - imgTop)
      if (images.main) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(pad, imgTop, contentW, imgH)
        ctx.clip()
        const params = imageDrawParams(images.main, contentW, imgH, design.imageTreatment, design.imageZoom, design.imageOffsetX, design.imageOffsetY)
        if (design.imageTreatment === 'contain') {
          ctx.fillStyle = design.background
          ctx.fillRect(pad, imgTop, contentW, imgH)
        }
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(images.main, pad + params.dx, imgTop + params.dy, params.dw, params.dh)
        ctx.restore()
      } else {
        roundRect(ctx, pad, imgTop, contentW, imgH, 2, dark ? 'rgba(255,255,255,0.04)' : 'rgba(20,18,14,0.04)')
        text(ctx, '此处留白 · 可放入项目截图', pad + contentW / 2, imgTop + imgH / 2, {
          size: 12,
          color: muted,
          align: 'center',
          family: 'serif',
          tracking: 1.2,
        })
      }
    }

    // 底部指标
    if (design.showMetrics && visibleMetricCount(design) > 0) {
      const bandY = H - pad - 56
      hairline(ctx, pad, bandY - 16, contentW, rule, 1)
      const visible = design.metrics.filter((m) => m.visible).slice(0, 4)
      const colW = contentW / Math.max(1, visible.length)
      visible.forEach((metric, index) => {
        const mx = pad + colW * index
        text(ctx, metric.known ? metric.value : '未知', mx, bandY + 22, {
          size: 24,
          weight: 600,
          color: metric.known ? ink : muted,
          family: 'serif',
        })
        text(ctx, metric.label.toUpperCase(), mx, bandY + 44, { size: 10, weight: 600, color: muted, tracking: 1.6 })
      })
    } else {
      drawFooter(ctx, c, pad, H - pad, contentW, { color: muted, size: 11 })
    }
  },
}



