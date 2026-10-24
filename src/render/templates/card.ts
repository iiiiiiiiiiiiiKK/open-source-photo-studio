import type { TemplateContext, TemplateMeta } from './shared'
import { designTone, drawFooter, drawHighlights, drawParagraph, drawTitleBlock, repoLine, visibleMetricCount } from './shared'
import { PALETTE, rgba, text, roundRect, hairline, paperGrain, metricsBand, screenshotFrame, languageBars, measure, mix } from '../primitives'
import { fontString, drawSpacedText, wrapText } from '../text'

/** 开源项目卡片：纸张底 + 左上标题 + 右侧真实截图 + 底部指标条 */
export const cardTemplate: TemplateMeta = {
  id: 'card',
  name: '开源项目卡片',
  tagline: '纸张质感，标题、截图与指标一目了然',
  defaultBackground: '#F4F1E9',
  defaultAccent: '#B4542F',
  needsScreenshot: true,
  render: (c) => {
    const { ctx, design, frame, images, project } = c
    const tone = designTone(design)
    const accent = design.accent
    const pad = frame.pad
    const W = frame.width
    const H = frame.height
    const family = design.font

    // 背景
    ctx.fillStyle = design.background
    ctx.fillRect(0, 0, W, H)
    paperGrain(ctx, W, H, { alpha: 0.035 + design.texture * 0.05, density: 0.0004, color: '#3A2E22' })

    // 顶部强调线
    ctx.fillStyle = accent
    ctx.fillRect(0, 0, W, 5)

    const name = project?.name || design.title || '未命名项目'
    const kickerOwner = project?.owner || (project?.host ? project.host : '')

    const showMetrics = design.showMetrics && visibleMetricCount(design) > 0
    const metricsH = showMetrics ? 78 : 0

    if (frame.shape === 'landscape') {
      const leftW = Math.round(W * 0.47)
      const x = pad
      let y = pad + 6

      // kicker
      ctx.save()
      ctx.font = fontString(13, 700, 'sans')
      ctx.fillStyle = rgba(accent, 1)
      const kicker = `${(project?.source === 'github' ? 'OPEN SOURCE' : 'PRODUCT')} · ${(project?.license || (project?.source === 'github' ? 'NO LICENSE' : project?.host || '')).toString().toUpperCase()}`
      drawSpacedText(ctx, kicker, x, y + 10, 1.4, 'left')
      ctx.restore()
      y += 34

      // 标题
      const titleBlock = drawTitleBlock(ctx, design.title, {
        x,
        y,
        width: leftW,
        maxHeight: 168,
        size: 60 * design.titleScale,
        minSize: 30,
        color: tone.ink,
        family,
        weight: design.font === 'serif' ? 600 : 700,
        lineHeightRatio: 1.08,
        maxLines: 2,
      })
      y += titleBlock.height + 12

      // 一句话介绍
      const oneLiner = design.oneLiner || project?.description || ''
      if (oneLiner) {
        const h = drawParagraph(ctx, oneLiner, x, y, leftW - 24, 96, {
          size: 17,
          color: tone.inkSoft,
          family,
          lineHeightRatio: 1.66,
        })
        y += h + 16
      }

      // 左栏亮点：按可用高度自适应条数与行距，把标题下方的空间填满，不留大片空白
      if (design.showHighlights && design.highlights.some(Boolean)) {
        const ownerRowH = 34
        const blockTop = y + 10
        const available = H - pad - metricsH - ownerRowH - 18 - blockTop
        if (available > 56) {
          const items = design.highlights.filter(Boolean)
          const size = 14.5
          const lineHeight = size * 1.5
          const textWidth = leftW - 24 - size * 1.25
          // 先按 1 行估算能放几条，再按实际行数收紧
          ctx.save()
          ctx.font = fontString(size, 500, family)
          const lineCounts = items.map((item) => wrapText(ctx, item, { maxWidth: textWidth, maxLines: 2 }).length)
          ctx.restore()

          let rows = 0
          let contentHeight = 0
          while (rows < Math.min(items.length, 5)) {
            const next = contentHeight + lineCounts[rows] * lineHeight + (rows > 0 ? 8 : 0)
            if (next > available) break
            contentHeight = next
            rows += 1
          }
          if (rows === 0) rows = Math.min(items.length, 1)

          // 剩余空间平均分配为行距（8–30px），避免版面稀疏或过挤
          const usedLines = lineCounts.slice(0, rows).reduce((sum, n) => sum + n, 0)
          const baseHeight = usedLines * lineHeight
          const gap = rows > 1 ? Math.max(8, Math.min(30, (available - baseHeight) / (rows - 1))) : 8

          ctx.save()
          ctx.fillStyle = rgba(accent, 1)
          ctx.fillRect(x, y - 6, 30, 2.5)
          ctx.restore()
          drawHighlights(ctx, items.slice(0, rows), x, blockTop, leftW - 24, {
            size,
            color: tone.inkSoft,
            accent,
            marker: 'dash',
            rowGap: gap,
            maxLinesPerItem: 2,
            maxItems: rows,
            family,
          })
        }
      }

      // 作者 / 站点行
      if (kickerOwner || project?.language) {
        ctx.save()
        ctx.font = fontString(12.5, 600, 'sans')
        ctx.fillStyle = tone.muted
        const rowY = H - pad - metricsH - 18
        const ownerLabel = kickerOwner ? `@${kickerOwner}` : project?.host || ''
        ctx.fillText(ownerLabel, x, rowY)
        if (project?.language) {
          const ownerWidth = ctx.measureText(ownerLabel).width
          ctx.fillStyle = rgba(accent, 1)
          ctx.beginPath()
          ctx.arc(x + ownerWidth + 14, rowY - 4, 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = tone.muted
          ctx.fillText(project.language, x + ownerWidth + 26, rowY)
        }
        ctx.restore()
      }

      // 右侧截图
      const shotX = x + leftW + 30
      const shotW = W - pad - shotX
      const shotY = pad + 12
      const shotH = H - shotY - pad - metricsH - 30
      if (images.main) {
        screenshotFrame(ctx, images.main, shotX, shotY, shotW, shotH, {
          radius: 12,
          chrome: 28,
          urlLabel: repoLine(project).replace(/^https?:\/\//, ''),
          zoom: design.imageZoom,
          offsetX: design.imageOffsetX,
          offsetY: design.imageOffsetY,
          mutedColor: tone.muted,
          treatment: design.imageTreatment,
        })
      } else {
        // 无图占位：改为数据面板（语言构成 / 亮点 / 标签），而不是留一个空框
        roundRect(ctx, shotX, shotY, shotW, shotH, 12, tone.panel, rgba(tone.line, 1), 1)
        text(ctx, '数据面板', shotX + 24, shotY + 40, { size: 12, weight: 700, color: tone.muted, tracking: 1.4, family: 'sans' })
        text(ctx, 'NO SCREENSHOT', shotX + shotW - 24, shotY + 40, {
          size: 10,
          weight: 600,
          color: rgba(accent, 0.9),
          tracking: 1.2,
          align: 'right',
          family: 'mono',
        })
        hairline(ctx, shotX + 24, shotY + 56, shotW - 48, tone.line)

        const langs = project?.languages || []
        let cy = shotY + 80
        if (langs.length) {
          cy += languageBars(ctx, shotX + 24, cy - 8, shotW - 48, langs, { color: tone.ink, accent, labelSize: 13, max: 3 }) + 14
        } else {
          // 手动模式等没有语言数据的情况：把亮点搬进面板，避免大片空白
          const fill = design.highlights.filter(Boolean).slice(0, 3)
          if (fill.length) {
            text(ctx, '核心亮点', shotX + 24, cy, { size: 11, weight: 700, color: accent, tracking: 1.4, family: 'sans' })
            cy += 22
            for (const item of fill) {
              const lines = drawHighlights(ctx, [item], shotX + 24, cy, shotW - 48, {
                size: 13,
                color: tone.inkSoft,
                accent,
                marker: 'dash',
                rowGap: 0,
                maxLinesPerItem: 2,
                family,
              })
              cy += lines + 16
            }
          } else {
            text(ctx, '暂无可用数据', shotX + 24, cy, { size: 13, color: tone.muted, family })
          }
        }

        const topics = (project?.topics?.length ? project.topics : design.tags).slice(0, 4)
        let ty = shotY + shotH - 26 - topics.length * 26
        for (const topic of topics) {
          text(ctx, `· ${topic}`, shotX + 24, ty, { size: 12.5, color: tone.muted, family: 'mono' })
          ty += 26
        }
      }

      // 指标条
      if (showMetrics && design.metrics.length) {
        const bandY = H - pad - metricsH + 12
        hairline(ctx, pad, bandY - 20, W - pad * 2, tone.line)
        metricsBand(
          ctx,
          pad,
          bandY,
          W - pad * 2,
          design.metrics.filter((m) => m.visible).map((m) => ({ label: m.label, value: m.known ? m.value : '未知', known: m.known })),
          { color: tone.ink, mutedColor: tone.muted, lineColor: tone.line, size: 27, labelSize: 11 }
        )
      } else {
        drawFooter(ctx, c, pad, H - pad + 4, W - pad * 2, { color: tone.muted, size: 11.5 })
      }
    } else {
      // 方图 / 竖图
      const isPortrait = frame.shape === 'portrait'
      const x = pad
      const contentW = W - pad * 2
      let y = pad + 4

      ctx.save()
      ctx.font = fontString(12.5, 700, 'sans')
      ctx.fillStyle = accent
      const kicker = `${project?.source === 'github' ? 'OPEN SOURCE' : 'PRODUCT'}${project?.license ? ` · ${project.license}` : ''}`
      drawSpacedText(ctx, kicker, x, y + 10, 1.5, 'left')
      // 右上角仓库地址
      ctx.font = fontString(11.5, 500, 'mono')
      ctx.fillStyle = tone.muted
      const repoShort = repoLine(project).replace(/^https?:\/\/(www\.)?/, '')
      ctx.textAlign = 'right'
      ctx.fillText(repoShort, W - pad, y + 10, contentW * 0.5)
      ctx.restore()
      y += 36

      const titleSize = (isPortrait ? 78 : 70) * design.titleScale
      const titleBlock = drawTitleBlock(ctx, design.title, {
        x,
        y,
        width: contentW,
        maxHeight: isPortrait ? 240 : 200,
        size: titleSize,
        minSize: 34,
        color: tone.ink,
        family,
        weight: design.font === 'serif' ? 600 : 700,
        lineHeightRatio: 1.06,
        maxLines: isPortrait ? 3 : 2,
      })
      y += titleBlock.height + 14

      // 强调色短线
      ctx.fillStyle = accent
      ctx.fillRect(x, y, 56, 3)
      y += 22

      const oneLiner = design.oneLiner || project?.description || ''
      if (oneLiner) {
        const oneH = drawParagraph(ctx, oneLiner, x, y, isPortrait ? contentW : contentW * 0.92, isPortrait ? 110 : 92, {
          size: isPortrait ? 19 : 18,
          color: tone.inkSoft,
          family,
          lineHeightRatio: 1.66,
        })
        y += oneH + 18
      }

      // 截图区域
      const metricsBlock = showMetrics ? 92 : 30
      const highlightsNeed = isPortrait && design.showHighlights && design.highlights.length ? 250 : 0
      const shotTop = y
      const shotBottom = H - pad - metricsBlock - highlightsNeed - 16
      const shotH = Math.max(120, shotBottom - shotTop)

      if (images.main) {
        screenshotFrame(ctx, images.main, x, shotTop, contentW, shotH, {
          radius: 14,
          chrome: 30,
          urlLabel: repoShort,
          zoom: design.imageZoom,
          offsetX: design.imageOffsetX,
          offsetY: design.imageOffsetY,
          mutedColor: tone.muted,
          treatment: design.imageTreatment,
        })
      } else {
        roundRect(ctx, x, shotTop, contentW, shotH, 14, tone.panel, rgba(tone.line, 1), 1)
        const langs = project?.languages || []
        text(ctx, '数据面板', x + 26, shotTop + 44, { size: 12, weight: 700, color: tone.muted, tracking: 1.4 })
        text(ctx, 'NO SCREENSHOT', x + contentW - 26, shotTop + 44, {
          size: 10,
          weight: 600,
          color: rgba(accent, 0.9),
          tracking: 1.2,
          align: 'right',
          family: 'mono',
        })
        if (langs.length) {
          languageBars(ctx, x + 26, shotTop + 74, contentW - 52, langs, { color: tone.ink, accent, labelSize: 14, max: 3 })
        } else {
          // 手动模式：用亮点填充面板，而不是只写一句"暂无数据"
          const fill = design.highlights.filter(Boolean).slice(0, isPortrait ? 4 : 3)
          if (fill.length) {
            text(ctx, '核心亮点', x + 26, shotTop + 78, { size: 11, weight: 700, color: accent, tracking: 1.4 })
            drawHighlights(ctx, fill, x + 26, shotTop + 98, contentW - 52, {
              size: 15,
              color: tone.inkSoft,
              accent,
              marker: 'dash',
              rowGap: 12,
              maxLinesPerItem: 2,
              family,
              maxItems: isPortrait ? 4 : 3,
            })
          } else {
            text(ctx, '暂无可用数据', x + 26, shotTop + 100, { size: 14, color: tone.muted, family })
          }
        }
      }
      y = shotTop + shotH + 22

      if (highlightsNeed) {
        drawHighlights(ctx, design.highlights, x, y, contentW, {
          size: 17,
          color: tone.inkSoft,
          accent,
          marker: 'dash',
          rowGap: 12,
          maxItems: 3,
          family,
        })
      }

      if (showMetrics && design.metrics.length) {
        const bandY = H - pad - 62
        hairline(ctx, x, bandY - 18, contentW, tone.line)
        metricsBand(
          ctx,
          x,
          bandY,
          contentW,
          design.metrics.filter((m) => m.visible).map((m) => ({ label: m.label, value: m.known ? m.value : '未知', known: m.known })),
          { color: tone.ink, mutedColor: tone.muted, lineColor: tone.line, size: 26, labelSize: 10.5 }
        )
      } else {
        drawFooter(ctx, c, x, H - pad + 2, contentW, { color: tone.muted, size: 11.5 })
      }
    }
  },
}








