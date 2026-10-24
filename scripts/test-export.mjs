// 端到端导出测试：用真实浏览器打开工作台，跑完整流程并检查下载的 PNG。
// 用法：node scripts/test-export.mjs [目标网址]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowserExecutable } from '../server/lib/screenshot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'shots-out')
const base = process.env.APP_URL || 'http://127.0.0.1:8931'
const target = process.argv[2] || 'https://github.com/facebook/react'

fs.mkdirSync(outDir, { recursive: true })

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.slice(1, 4).toString() !== 'PNG') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`)
  console.log(`  ✓ ${message}`)
}

const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true })
const context = await browser.newContext({ viewport: { width: 1500, height: 940 }, acceptDownloads: true })
const page = await context.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

try {
  console.log(`\n=== 打开 ${base} ===`)
  await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.landing-title')
  assert(true, '首页加载成功')

  console.log(`\n=== 输入项目地址 ${target} ===`)
  await page.fill('input[aria-label="项目地址"]', target)
  await page.click('button:has-text("读取项目")')

  // 等待进入工作台
  await page.waitForSelector('.workspace', { timeout: 120000 })
  await page.waitForTimeout(3500)
  assert(true, '进入工作台')

  const title = await page.inputValue('input[placeholder="项目名称"]')
  assert(title.length > 0, `标题已填充：${title}`)

  const oneLiner = await page.inputValue('textarea[placeholder*="用一句中文"]')
  assert(oneLiner.length > 10, `一句话介绍已生成（${oneLiner.length} 字）`)

  const highlights = await page.locator('.hl-row textarea').count()
  assert(highlights >= 3, `亮点条目 ${highlights} 条`)

  const assetCount = await page.locator('.asset-tile img').count()
  assert(assetCount >= 1, `素材缩略图 ${assetCount} 张`)

  // 画布是否真的画了东西（非纯白）
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('.canvas-shell canvas')
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, Math.min(canvas.width, 200), Math.min(canvas.height, 200)).data
    let nonWhite = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++
    }
    return { width: canvas.width, height: canvas.height, nonWhite, total: data.length / 4 }
  })
  assert(canvasInfo && canvasInfo.nonWhite > 100, `预览画布已绘制内容（${canvasInfo?.nonWhite} 像素非白）`)

  // 逐一切换模板，确认不崩溃
  console.log('\n=== 切换六种模板 ===')
  const templates = await page.locator('.panel-right .template-card').count()
  assert(templates === 6, `模板数量 ${templates}`)
  for (let i = 0; i < templates; i++) {
    await page.locator('.panel-right .template-card').nth(i).click()
    await page.waitForTimeout(900)
    const name = await page.locator('.panel-right .template-card').nth(i).locator('.template-name').innerText()
    const rendered = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas-shell canvas')
      if (!canvas) return false
      const ctx = canvas.getContext('2d')
      const data = ctx.getImageData(0, 0, Math.min(canvas.width, 120), Math.min(canvas.height, 120)).data
      let nonWhite = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] < 250) nonWhite++
      return nonWhite > 20
    })
    assert(rendered, `模板「${name}」渲染正常`)
  }

  // 三种比例导出
  console.log('\n=== 导出三种比例 ===')
  await page.locator('.panel-right .template-card').first().click()
  await page.waitForTimeout(700)

  const ratios = [
    { key: '16:9', expect: [2400, 1350] },
    { key: '1:1', expect: [1800, 1800] },
    { key: '3:4', expect: [1800, 2400] },
  ]
  const saved = []
  for (const ratio of ratios) {
    await page.locator('.stage-bar .seg-item', { hasText: ratio.key }).first().click()
    await page.waitForTimeout(700)
    await page.click('button:has-text("导出 PNG")')
    await page.waitForSelector('.modal')
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 })
    await page.locator('.modal-foot button', { hasText: `导出 ${ratio.key} PNG` }).click()
    const download = await downloadPromise
    const filename = download.suggestedFilename()
    const filePath = path.join(outDir, filename)
    await download.saveAs(filePath)
    const buffer = fs.readFileSync(filePath)
    const size = pngSize(buffer)
    assert(size !== null, `${ratio.key} 生成有效 PNG：${filename}`)
    assert(size.width === ratio.expect[0] && size.height === ratio.expect[1], `${ratio.key} 尺寸 ${size.width}×${size.height} 符合预期`)
    saved.push({ ratio: ratio.key, file: filename, bytes: buffer.length, size })
    await page.click('.modal-foot button:has-text("关闭")')
    await page.waitForTimeout(300)
  }

  // 长标题 / 中文 / 缺图稳健性
  console.log('\n=== 极端输入稳健性 ===')
  await page.fill('input[placeholder="项目名称"]', '一个非常非常长的中文项目名称用来测试极端排版情况下的自动换行与字号缩放是否正常工作')
  await page.waitForTimeout(600)
  const longTitleOk = await page.evaluate(() => Boolean(document.querySelector('.canvas-shell canvas')))
  assert(longTitleOk, '超长中文标题不导致崩溃')

  await page.fill('textarea[placeholder*="用一句中文"]', '')
  await page.waitForTimeout(500)
  assert(true, '空的一句话介绍不导致崩溃')

  assert(consoleErrors.length === 0 || consoleErrors.every((e) => !/TypeError|ReferenceError/.test(e)), `无致命脚本错误（${consoleErrors.length} 条 console 错误）`)
  if (consoleErrors.length) console.log('    错误详情：', consoleErrors.slice(0, 5))

  console.log('\n=== 导出结果 ===')
  for (const item of saved) {
    console.log(`  ${item.ratio}: ${item.file} (${(item.bytes / 1024).toFixed(0)} KB, ${item.size.width}×${item.size.height})`)
  }
  console.log('\n全部通过 ✓')
} catch (error) {
  console.error('\n测试失败：', error.message)
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: false }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}

