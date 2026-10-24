// 工作台截图：用于人工核对桌面三栏布局、画布比例与面板密度。
// 用法：node scripts/shot-ui.mjs [网址]
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

const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 })
try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, 'ui-landing.png') })
  console.log('saved ui-landing.png')

  await page.fill('input[aria-label="项目地址"]', target)
  await page.click('button:has-text("读取项目")')
  await page.waitForSelector('.workspace', { timeout: 120000 })
  await page.waitForTimeout(3500)
  await page.screenshot({ path: path.join(outDir, 'ui-studio.png') })
  console.log('saved ui-studio.png')

  // 依次切换模板并截图，方便核对每个模板的成图观感
  const names = await page.locator('.panel-right .template-card .template-name').allInnerTexts()
  for (let i = 0; i < names.length; i++) {
    await page.locator('.panel-right .template-card').nth(i).click()
    await page.waitForTimeout(900)
    const safe = names[i].replace(/[\\/:*?"<>|\s]+/g, '-')
    await page.locator('.stage-viewport .canvas-shell').screenshot({ path: path.join(outDir, `template-${i}-${safe}.png`) })
    console.log(`saved template-${i}-${safe}.png`)
  }
} finally {
  await browser.close()
}

