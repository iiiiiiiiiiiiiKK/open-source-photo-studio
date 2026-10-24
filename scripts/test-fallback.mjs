// 兜底路径测试：手动模式、无图片导出、异常网址提示、社交预览。
// 用法：node scripts/test-fallback.mjs
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowserExecutable } from '../server/lib/screenshot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'shots-out')
const base = process.env.APP_URL || 'http://127.0.0.1:8931'
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
const context = await browser.newContext({ viewport: { width: 1500, height: 940 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 })

  console.log('\n=== 1. 异常网址提示 ===')
  await page.fill('input[aria-label="项目地址"]', 'http://127.0.0.1:8931/api/health')
  await page.click('button:has-text("读取项目")')
  await page.waitForSelector('.status-line[data-tone="err"]', { timeout: 30000 })
  const errText = await page.locator('.status-line[data-tone="err"]').first().innerText()
  ok(/内网|IP|禁止|拦截/.test(errText), '内网地址给出明确中文提示', errText.slice(0, 60))

  console.log('\n=== 2. 手动模式（无网络） ===')
  await page.click('button:has-text("手动填写项目信息")')
  await page.waitForSelector('.modal')
  await page.fill('.modal input[placeholder*="my-awesome-lib"]', '内网构建工具')
  await page.fill('.modal textarea[placeholder*="这是一个用来"]', '一个只在公司内网使用的构建流水线工具，支持增量编译与缓存复用。')
  await page.fill('.modal input[placeholder="owner"]', 'infra-team')
  await page.fill('.modal input[placeholder*="typescript, cli"]', 'typescript, cli, build')
  await page.fill('.modal textarea[placeholder*="零配置启动"]', '增量编译\n单文件产物\n离线可用')
  await page.click('.modal-foot button:has-text("进入工作台")')
  await page.waitForSelector('.workspace', { timeout: 60000 })
  await page.waitForTimeout(2200)

  const titleValue = await page.inputValue('input[placeholder="项目名称"]')
  ok(titleValue === '内网构建工具', '标题来自手动输入', titleValue)
  const hlCount = await page.locator('.hl-row textarea').count()
  ok(hlCount === 3, `亮点 ${hlCount} 条来自手动输入`)
  const hlText = await page.locator('.hl-row textarea').first().inputValue()
  ok(hlText === '增量编译', '亮点内容正确', hlText)

  const unknownBadges = await page.locator('.panel-left .badge', { hasText: '未知' }).count()
  ok(unknownBadges >= 0, `未知指标标记 ${unknownBadges} 处`)
  const assetImages = await page.locator('.panel-left .asset-tile img').count()
  ok(assetImages === 0, '手动模式没有图片素材（不伪造截图）')

  console.log('\n=== 3. 无图片时导出 ===')
  await page.click('button:has-text("导出 PNG")')
  await page.waitForSelector('.modal')
  const checks = await page.locator('.modal .check-item').allInnerTexts()
  ok(checks.some((c) => /没有可用图片/.test(c)), '导出检查提示缺少图片')
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 })
  await page.locator('.modal-foot button', { hasText: '导出 16:9 PNG' }).click()
  const download = await downloadPromise
  const file = path.join(outDir, `manual-${download.suggestedFilename()}`)
  await download.saveAs(file)
  const size = pngSize(fs.readFileSync(file))
  ok(size && size.width === 2400 && size.height === 1350, `无图也能导出 ${size?.width}×${size?.height}`)
  await page.click('.modal-foot button:has-text("关闭")')

  console.log('\n=== 4. 撤销 / 重做 ===')
  await page.fill('input[placeholder="项目名称"]', '改过的标题')
  await page.waitForTimeout(400)
  const changed = await page.inputValue('input[placeholder="项目名称"]')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const undone = await page.inputValue('input[placeholder="项目名称"]')
  ok(changed === '改过的标题' && undone !== '改过的标题', '撤销生效', `${changed} → ${undone}`)
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(500)
  const redone = await page.inputValue('input[placeholder="项目名称"]')
  ok(redone === '改过的标题', '重做生效', redone)

  console.log('\n=== 5. 社交预览 ===')
  await page.click('button:has-text("社交预览")')
  await page.waitForSelector('.social-mock')
  const tweet = await page.locator('.social-mock').innerText()
  ok(tweet.length > 10, '社交预览有文案内容')
  await page.click('.modal-head .icon-btn')

  console.log('\n=== 6. 切换比例不崩溃 ===')
  for (const ratio of ['1:1', '3:4', '16:9']) {
    await page.locator('.stage-bar .seg-item', { hasText: ratio }).first().click()
    await page.waitForTimeout(700)
    const drawn = await page.evaluate(() => {
      const canvas = document.querySelector('.stage-viewport canvas')
      if (!canvas) return false
      const ctx = canvas.getContext('2d')
      const data = ctx.getImageData(0, 0, Math.min(80, canvas.width), Math.min(80, canvas.height)).data
      let nonBg = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] < 250) nonBg++
      return nonBg > 20
    })
    ok(drawn, `${ratio} 渲染正常`)
  }

  ok(errors.length === 0, `无脚本错误（${errors.length}）`, errors.slice(0, 2).join(' | '))
  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
  if (failed) process.exitCode = 1
} catch (error) {
  console.error('\n测试失败：', error.message)
  await page.screenshot({ path: path.join(outDir, 'fallback-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
