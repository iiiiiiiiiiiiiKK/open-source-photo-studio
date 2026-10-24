// 抓取预览画布并保存为 PNG，用于把成图缩到可读尺寸后做 ASCII 检查。
// 用法：node scripts/grab-canvas.mjs <url> <模板索引> [比例] [输出名]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowserExecutable } from '../server/lib/screenshot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'shots-out')
fs.mkdirSync(outDir, { recursive: true })

const base = process.env.APP_URL || 'http://127.0.0.1:8931'
const target = process.argv[2] || 'https://example.com'
const templateIndex = Number(process.argv[3] || 0)
const ratio = process.argv[4] || '16:9'
const name = process.argv[5] || `canvas-${templateIndex}-${ratio.replace(':', 'x')}.png`

const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 })
  await page.fill('input[aria-label="项目地址"]', target)
  await page.click('button:has-text("读取项目")')
  await page.waitForSelector('.workspace', { timeout: 150000 })
  await page.waitForTimeout(3000)
  await page.locator('.stage-bar .seg-item', { hasText: ratio }).first().click()
  await page.waitForTimeout(400)
  await page.locator('.panel-right .template-card').nth(templateIndex).click()
  await page.waitForTimeout(2500)

  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('.stage-viewport canvas')
    return canvas.toDataURL('image/png')
  })
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')
  fs.writeFileSync(path.join(outDir, name), buffer)
  const size = { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) }
  console.log(`saved ${name} ${size.w}×${size.h} ${(buffer.length / 1024).toFixed(0)}KB`)
} finally {
  await browser.close()
}
