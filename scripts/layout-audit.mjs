// 布局审计：用真实渲染器把 6 模板 × 3 比例全部渲染一遍，
// 收集每一段文字的绘制坐标，检查是否越出版面、是否压到安全边距内。
// 用法：node scripts/layout-audit.mjs
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowserExecutable } from '../server/lib/screenshot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'shots-out')
const base = process.env.APP_URL || 'http://127.0.0.1:8931'
fs.mkdirSync(outDir, { recursive: true })

const FRAMES = {
  '16:9': { width: 1200, height: 675 },
  '1:1': { width: 1200, height: 1200 },
  '3:4': { width: 1200, height: 1600 },
}

const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } })
const problems = []

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 })
  await page.fill('input[aria-label="项目地址"]', process.env.AUDIT_URL || 'https://github.com/facebook/react')
  await page.click('button:has-text("读取项目")')
  await page.waitForSelector('.workspace', { timeout: 120000 })
  await page.waitForTimeout(3000)

  const templateCount = await page.locator('.panel-right .template-card').count()
  const ratios = ['16:9', '1:1', '3:4']

  for (const ratio of ratios) {
    await page.locator('.stage-bar .seg-item', { hasText: ratio }).first().click()
    await page.waitForTimeout(500)
    for (let i = 0; i < templateCount; i++) {
      const card = page.locator('.panel-right .template-card').nth(i)
      const name = await card.locator('.template-name').innerText()
      await page.evaluate(() => {
        window.__OSS_TEXT_LOG__ = []
      })
      await card.click()
      await page.waitForTimeout(700)

      const log = await page.evaluate(() => window.__OSS_TEXT_LOG__ || [])
      const frame = FRAMES[ratio]
      const outside = log.filter(
        (item) => item.left < -2 || item.right > frame.width + 2 || item.top < -6 || item.bottom > frame.height + 2
      )
      if (outside.length) {
        problems.push({ ratio, template: name, type: '溢出画布', items: outside.slice(0, 4) })
      }
      const tooTight = log.filter((item) => {
        // 只检查正文类文字（字号 >= 10），忽略视觉装饰
        if (item.size < 10) return false
        return item.left < 8 || item.right > frame.width - 8 || item.top < 6 || item.bottom > frame.height - 6
      })
      if (tooTight.length) {
        problems.push({ ratio, template: name, type: '贴边过近', items: tooTight.slice(0, 4) })
      }
      console.log(`  ${ratio} · ${name}: ${log.length} 段文字，问题 ${outside.length + tooTight.length}`)
    }
  }
} catch (error) {
  console.error('审计执行失败：', error.message)
  process.exitCode = 1
} finally {
  await browser.close()
}

if (problems.length) {
  console.error('\n发现布局问题：')
  for (const problem of problems) {
    console.error(`- [${problem.ratio}] ${problem.template} · ${problem.type}`)
    for (const item of problem.items) {
      console.error(`    "${item.text}" left=${item.left} right=${item.right} top=${item.top} bottom=${item.bottom}`)
    }
  }
  process.exitCode = 1
} else {
  console.log('\n布局审计通过：所有文字均在版面安全范围内 ✓')
}
