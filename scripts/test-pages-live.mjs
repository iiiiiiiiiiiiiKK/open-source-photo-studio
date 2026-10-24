// 验证线上 GitHub Pages 部署：真实浏览器打开、探测静态模式、离线手动模式导出
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowserExecutable } from '../server/lib/screenshot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'shots-out')
const SITE = process.env.SITE_URL || 'https://iiiiiiiiiiiiiKK.github.io/open-source-photo-studio/'
fs.mkdirSync(outDir, { recursive: true })

let passed = 0
let failed = 0
function ok(condition, message, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}${extra ? ` — ${extra}` : ''}`)
  } else {
    failed++
    console.error(`  ✗ ${message}${extra ? ` — ${extra}` : ''}`)
  }
}
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.slice(1, 4).toString() !== 'PNG') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
const failedRequests = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('requestfailed', (r) => failedRequests.push(`${r.url().slice(0, 80)} ${r.failure()?.errorText}`))

try {
  console.log(`\n=== 线上部署验证：${SITE} ===`)
  await page.goto(SITE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.landing-title', { timeout: 25000 })
  ok(true, '线上页面加载成功')

  const title = await page.title()
  ok(/照相馆/.test(title), '页面标题正确', title)

  const eyebrow = await page.locator('.landing-eyebrow').innerText()
  ok(/静态/.test(eyebrow), '自动识别为静态版', eyebrow.replace(/\n/g, ' '))

  const titleText = await page.locator('.landing-title').innerText()
  ok(titleText.length > 5, '主标题渲染正常', titleText.replace(/\n/g, ' '))

  // 静态资源加载
  ok(failedRequests.length === 0, `所有静态资源加载成功（失败 ${failedRequests.length}）`, failedRequests.slice(0, 2).join(' | '))
  ok(errors.length === 0, `无脚本错误（${errors.length}）`, errors.slice(0, 2).join(' | '))

  console.log('\n=== 手动模式（离线可用） ===')
  await page.click('button:has-text("手动填写项目信息")')
  await page.waitForSelector('.modal')
  await page.fill('.modal input[placeholder*="my-awesome-lib"]', '线上部署验证')
  await page.fill('.modal textarea[placeholder*="这是一个用来"]', '验证 GitHub Pages 静态部署下，手动模式与三种比例导出都能正常工作。')
  await page.fill('.modal input[placeholder*="typescript, cli"]', 'pages, static, canvas')
  await page.fill('.modal textarea[placeholder*="零配置启动"]', '纯静态托管\n浏览器内渲染\n三种比例导出')
  await page.click('.modal-foot button:has-text("进入工作台")')
  await page.waitForSelector('.workspace', { timeout: 40000 })
  await page.waitForTimeout(2200)
  const manualTitle = await page.inputValue('input[placeholder="项目名称"]')
  ok(manualTitle === '线上部署验证', '手动模式进入工作台', manualTitle)

  console.log('\n=== 线上导出三种比例 ===')
  for (const ratio of [
    { key: '16:9', expect: [2400, 1350] },
    { key: '1:1', expect: [1800, 1800] },
    { key: '3:4', expect: [1800, 2400] },
  ]) {
    await page.locator('.stage-bar .seg-item', { hasText: ratio.key }).first().click()
    await page.waitForTimeout(800)
    await page.click('button:has-text("导出 PNG")')
    await page.waitForSelector('.modal')
    const dl = page.waitForEvent('download', { timeout: 60000 })
    await page.locator('.modal-foot button', { hasText: `导出 ${ratio.key} PNG` }).click()
    const download = await dl
    const file = path.join(outDir, `pages-${download.suggestedFilename()}`)
    await download.saveAs(file)
    const size = pngSize(fs.readFileSync(file))
    ok(size && size.width === ratio.expect[0] && size.height === ratio.expect[1], `线上 ${ratio.key} 导出 ${size?.width}×${size?.height}`)
    await page.click('.modal-foot button:has-text("关闭")')
    await page.waitForTimeout(300)
  }

  // 截一张线上工作台图
  await page.screenshot({ path: path.join(outDir, 'pages-live-studio.png') })
  ok(fs.existsSync(path.join(outDir, 'pages-live-studio.png')), '已保存线上工作台截图')

  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
  if (failed) process.exitCode = 1
} catch (error) {
  console.error('\n验证失败：', error.message)
  await page.screenshot({ path: path.join(outDir, 'pages-live-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
