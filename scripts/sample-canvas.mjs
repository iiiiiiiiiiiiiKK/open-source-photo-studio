// 画布采样：加载工作台，把成图按网格采样平均色，帮助定位"图片区域是空白"这类问题。
// 用法：node scripts/sample-canvas.mjs <url> [模板索引=0] [比例=16:9]
import { chromium } from 'playwright-core'
import { findBrowserExecutable } from '../server/lib/screenshot.mjs'

const base = process.env.APP_URL || 'http://127.0.0.1:8931'
const target = process.argv[2] || 'https://github.com/supabase/supabase'
const templateIndex = Number(process.argv[3] || 0)
const ratio = process.argv[4] || '16:9'

const browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } })
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

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('.stage-viewport canvas')
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const cols = 8
    const rows = 5
    const grid = []
    for (let r = 0; r < rows; r++) {
      const row = []
      for (let c = 0; c < cols; c++) {
        const x = Math.floor((c + 0.5) * (width / cols))
        const y = Math.floor((r + 0.5) * (height / rows))
        const d = ctx.getImageData(x, y, 1, 1).data
        row.push(`${d[0]},${d[1]},${d[2]}`)
      }
      grid.push(row)
    }
    return { width, height, grid }
  })
  console.log(`canvas ${info.width}×${info.height}`)
  info.grid.forEach((row, index) => console.log(`r${index}  ${row.join('  ')}`))

  // 检查选中的素材
  const assets = await page.locator('.panel-left .asset-tile img').evaluateAll((imgs) =>
    imgs.map((img) => ({ src: img.currentSrc || img.src, w: img.naturalWidth, h: img.naturalHeight }))
  )
  console.log('\n素材：')
  for (const asset of assets) {
    console.log(`  ${asset.w}×${asset.h}  ${asset.src.slice(0, 110)}`)
  }
} finally {
  await browser.close()
}
