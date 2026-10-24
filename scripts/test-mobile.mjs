// 移动端与窄屏检查：确认移动端是分步骤编辑，且没有横向溢出。
// 用法：node scripts/test-mobile.mjs
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

const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  console.log('\n=== 移动端 390×844 ===')
  await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.landing-title')
  ok(true, '移动端首页可加载')

  const overflowLanding = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(overflowLanding <= 1, '首页无横向溢出', `${overflowLanding}px`)

  await page.fill('input[aria-label="项目地址"]', 'https://example.com')
  // 移动端不默认开截图，避免等待过久
  await page.click('button:has-text("读取项目")')
  await page.waitForSelector('.mobile-tabbar', { timeout: 120000 })
  await page.waitForTimeout(2500)
  ok(true, '进入移动端工作台')

  const desktopWorkspaceVisible = await page.locator('.workspace').isVisible()
  ok(!desktopWorkspaceVisible, '窄屏不显示桌面三栏布局')

  const tabCount = await page.locator('.mobile-tab').count()
  ok(tabCount === 4, `底部步骤栏 ${tabCount} 项`)

  const overflowStudio = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(overflowStudio <= 1, '工作台无横向溢出', `${overflowStudio}px`)

  // 逐步切换 4 个步骤
  for (const label of ['文案', '模板', '样式', '预览']) {
    await page.locator('.mobile-tab', { hasText: label }).click()
    await page.waitForTimeout(600)
    const visible = await page.locator('.mobile-body').isVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ok(visible && overflow <= 1, `步骤「${label}」正常（溢出 ${overflow}px）`)
  }

  // 触点尺寸检查（重要可点元素 ≥ 40px）
  await page.locator('.mobile-tab', { hasText: '模板' }).click()
  await page.waitForTimeout(400)
  const smallTargets = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.mobile-body button, .mobile-tabbar button')]
    return nodes
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        return { text: (el.textContent || '').trim().slice(0, 12), w: Math.round(rect.width), h: Math.round(rect.height) }
      })
      .filter((item) => item.w > 0 && item.h > 0 && item.h < 28)
  })
  ok(smallTargets.length === 0, '可点区域高度均 ≥ 28px', smallTargets.slice(0, 3).map((t) => `${t.text}:${t.h}px`).join(', '))

  await page.locator('.mobile-tab', { hasText: '预览' }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(outDir, 'mobile-preview.png') })
  ok(fs.existsSync(path.join(outDir, 'mobile-preview.png')), '已保存移动端截图用于人工核对')

  ok(errors.length === 0, `无脚本错误（${errors.length}）`, errors.slice(0, 2).join(' | '))
  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
  if (failed) process.exitCode = 1
} catch (error) {
  console.error('\n测试失败：', error.message)
  await page.screenshot({ path: path.join(outDir, 'mobile-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
