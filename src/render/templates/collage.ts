import type { TemplateContext, TemplateMeta } from './shared'
import { drawFooter, drawParagraph, drawTitleBlock, repoLine, visibleMetricCount, imageDrawParams } from './shared'
import { PALETTE, rgba, text, roundRect, hairline, paperGrain, measure, mix, luminance } from '../primitives'
import { fontString, drawSpacedText } from '../text'

/** 项目截图拼贴：主图 + 小图网格，像作品集一样展示多个界面 */
export const collageTemplate: TemplateMeta = {
  id: 'collage',
  name: '项目截图拼贴',
  tagline: '主图 + 多图网格，展示多个界面',
  defaultBackground: '#ECEAE3',
  defaultAccent: '#2C5F8D',
  needsScreenshot: true,
  render: (c) => {
    const { ctx, design, frame, images, project } = c
    const accent = design.accent
    const W = frame.width
    const H = frame.height
    const pad = Math.round(W * 0.055)
    const contentW = W - pad * 2
    const dark = luminance(design.background) < 0.35
    const ink = dark ? '#F0EEE9' : '#16171B'
    const muted = dark ? 'rgba(240,238,233,0.55)' : 'rgba(22,23,27,0.55)'
    const soft = dark ? 'rgba(240,238,233,0.78)' : 'rgba(22,23,27,0.72)'
    const line = dark ? 'rgba(255,255,255,0.14)' : 'rgba(22,23,27,0.14)'
    const isLandscape = frame.shape === 'landscape'
    const isPortrait = frame.shape === 'portrait'

    ctx.fillStyle = design.background
    ctx.fillRect(0, 0, W, H)
    paperGrain(ctx, W, H, { alpha: 0.02 + design.texture * 0.04, density: 0.00032, color: dark ? '#FFFFFF' : '#000000' })

    // 顶部标题区
    let y = pad
    ctx.save()
    ctx.font = fontString(11.5, 700, 'sans')
    ctx.fillStyle = accent
    drawSpacedText(ctx, 'SCREENSHOT GALLERY', pad, y + 10, 2, 'left')
    ctx.textAlign = 'right'
    ctx.font = fontString(11.5, 500, 'mono')
    ctx.fillStyle = muted
    ctx.fillText(repoLine(project).replace(/^https?:\/\/(www\.)?/, ''), W - pad, y + 10, contentW * 0.6)
    ctx.restore()
    y += 26
    hairline(ctx, pad, y, contentW, line, 1)
    y += isLandscape ? 22 : 20

    const titleBlock = drawTitleBlock(ctx, design.title, {
      x: pad,
      y,
      width: isLandscape ? contentW * 0.7 : contentW,
      maxHeight: isLandscape ? 110 : 150,
      size: (isLandscape ? 46 : 54) * design.titleScale,
      minSize: 26,
      color: ink,
      family: design.font === 'serif' ? 'serif' : design.font,
      weight: 700,
      lineHeightRatio: 1.1,
      maxLines: 2,
    })
    y += titleBlock.height + 10

    const oneLiner = design.oneLiner || project?.description || ''
    if (oneLiner) {
      const h = drawParagraph(ctx, oneLiner, pad, y, isLandscape ? contentW * 0.58 : contentW * 0.86, 64, {
        size: 14.5,
        color: soft,
        family: 'sans',
        lineHeightRatio: 1.6,
      })
      y += h + 12
    }

    // 图片网格
    const footerH = design.showMetrics && visibleMetricCount(design) > 0 ? 76 : 26
    const gridTop = y + 10
    const gridBottom = H - pad - footerH - 8
    const gridH = Math.max(140, gridBottom - gridTop)

    const gallery = images.gallery.slice(0, 4)
    const hasSecondary = gallery.length >= 2

    const drawTile = (img: HTMLImageElement | null, x: number, y2: number, w: number, h: number, radius = 8, chrome = true) => {
      roundRect(ctx, x, y2, w, h, radius, dark ? 'rgba(255,255,255,0.05)' : '#FFFFFF')
      if (img) {
        ctx.save()
        roundRect(ctx, x, y2, w, h, radius, undefined, undefined)
        ctx.clip()
        const params = imageDrawParams(img, w, h, design.imageTreatment, design.imageZoom, design.imageOffsetX * 0.7, design.imageOffsetY * 0.7)
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, x + params.dx, y2 + params.dy, params.dw, params.dh)
        ctx.restore()
      } else {
        ctx.save()
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(22,23,27,0.05)'
        roundRect(ctx, x, y2, w, h, radius)
        ctx.fill()
        ctx.font = fontString(11, 500, 'sans')
        ctx.fillStyle = muted
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('暂无截图', x + w / 2, y2 + h / 2)
        ctx.restore()
      }
      if (chrome) {
        // 顶部一条极淡的浏览器栏
        ctx.save()
        roundRect(ctx, x, y2, w, h, radius, undefined, undefined)
        ctx.clip()
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(22,23,27,0.05)'
        ctx.fillRect(x, y2, w, Math.max(12, h * 0.055))
        ctx.restore()
      }
      roundRect(ctx, x, y2, w, h, radius, undefined, line, 1)
    }

    if (isLandscape) {
      const mainW = hasSecondary ? contentW * 0.64 : contentW
      const mainH = gridH
      drawTile(images.main, pad, gridTop, mainW - (hasSecondary ? 16 : 0), mainH, 10)

      if (hasSecondary) {
        const sideX = pad + mainW
        const sideW = contentW - mainW
        const smallH = (mainH - 16) / 2
        drawTile(gallery[0], sideX, gridTop, sideW, smallH, 8)
        drawTile(gallery[1] || null, sideX, gridTop + smallH + 16, sideW, smallH, 8)
      }
    } else {
      const mainH = hasSecondary ? gridH * 0.62 : gridH
      drawTile(images.main, pad, gridTop, contentW, mainH, 10)
      if (hasSecondary) {
        const smallTop = gridTop + mainH + 14
        const smallH = gridBottom - smallTop
        if (smallH > 40) {
          const gap = 14
          const count = Math.min(2, gallery.length)
          const smallW = (contentW - gap * (count - 1)) / count
          for (let i = 0; i < count; i++) {
            drawTile(gallery[i], pad + i * (smallW + gap), smallTop, smallW, smallH, 8)
          }
        }
      }
      // 竖版补充亮点
      if (isPortrait && design.showHighlights && design.highlights.length && !hasSecondary) {
        let hy = gridTop + mainH + 22
        design.highlights.slice(0, 2).forEach((item) => {
          const h = drawParagraph(ctx, item, pad, hy, contentW, 40, { size: 14, color: soft, family: 'sans', lineHeightRatio: 1.5 })
          hy += Math.max(30, h + 8)
        })
      }
    }

    // 底部
    if (design.showMetrics && visibleMetricCount(design) > 0) {
      const bandY = H - pad - 52
      hairline(ctx, pad, bandY - 16, contentW, line, 1)
      const visible = design.metrics.filter((m) => m.visible).slice(0, 4)
      const colW = contentW / Math.max(1, visible.length)
      visible.forEach((metric, index) => {
        const mx = pad + colW * index
        text(ctx, metric.known ? metric.value : '未知', mx, bandY + 22, { size: 24, weight: 700, color: metric.known ? ink : muted })
        text(ctx, metric.label.toUpperCase(), mx, bandY + 42, { size: 10, weight: 600, color: muted, tracking: 1.5 })
      })
    } else {
      drawFooter(ctx, c, pad, H - pad, contentW, { color: muted, size: 11 })
    }
  },
}



