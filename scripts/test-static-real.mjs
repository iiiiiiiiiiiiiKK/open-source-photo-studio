// 静态版「真实数据」测试：本机公网 IP 的 GitHub 匿名配额经常被共用耗尽（60/小时），
// 这里用 Playwright 的请求拦截把浏览器发往 api.github.com 的请求转由 Node 侧带 Token 转发，
// 从而验证静态模式的完整代码路径（组装元信息 → 解析 README → 生成文案 → 渲染导出），
// 但**不改动产品代码**：线上静态版仍然走纯匿名浏览器直连。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { findBrowserExecutable } from '../server/lib/screenshot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const siteDir = path.join(root, 'dist-static')
const outDir = path.join(root, 'shots-out')
const BASE_PATH = '/open-source-photo-studio/'
const PORT = 5273
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
fs.mkdirSync(outDir, { recursive: true })

if (!fs.existsSync(siteDir)) {
  console.error('缺少 dist-static，请先运行：STATIC=1 BASE=/open-source-photo-studio/ npm run build')
  process.exit(1)
}
if (!TOKEN) {
  console.error('需要 GITHUB_TOKEN 才能运行本测试（用于绕过匿名配额）')
  process.exit(1)
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  if (!url.startsWith(BASE_PATH)) {
    res.writeHead(404)
    res.end()
    return
  }
  let rel = url.slice(BASE_PATH.length) || 'index.html'
  if (rel.endsWith('/')) rel += 'index.html'
  const file = path.join(siteDir, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

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
page.on('pageerror', (e) => errors.push(e.message))

// 只对 api.github.com 做转发（加 Token）；图片等其它请求保持浏览器直连。
await page.route('https://api.github.com/**', async (route) => {
  const request = route.request()
  const target = request.url()
  try {
    const upstream = await fetch(target, {
      headers: {
        accept: request.headers()['accept'] || 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        authorization: `Bearer ${TOKEN}`,
        'user-agent': 'OpenSourcePhotoStudio-StaticTest',
      },
    })
    const body = Buffer.from(await upstream.arrayBuffer())
    const headers = { 'access-control-allow-origin': '*', 'content-type': upstream.headers.get('content-type') || 'application/json' }
    ;['x-ratelimit-remaining', 'x-ratelimit-limit', 'x-ratelimit-used'].forEach((h) => {
      const v = upstream.headers.get(h)
      if (v) headers[h] = v
    })
    await route.fulfill({ status: upstream.status, headers, body })
  } catch (error) {
    await route.abort().catch(() => {})
  }
})

try {
  console.log(`\n=== 静态版真实数据路径（api.github.com 由 Node 侧带 Token 转发）===`)
  await page.goto(`http://127.0.0.1:${PORT}${BASE_PATH}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.landing-title')

  await page.fill('input[aria-label="项目地址"]', 'https://github.com/supabase/supabase')
  await page.click('button:has-text("读取项目")')
  await page.waitForSelector('.workspace', { timeout: 120000 })
  await page.waitForTimeout(3500)

  const title = await page.inputValue('input[placeholder="项目名称"]')
  ok(title.length > 0, '标题已填充', title)
  const oneLiner = await page.inputValue('textarea[placeholder*="用一句中文"]')
  ok(oneLiner.length > 20, `一句话介绍（${oneLiner.length} 字）`)
  const hl = await page.locator('.hl-row textarea').count()
  ok(hl >= 3, `亮点 ${hl} 条`)
  const leftText = await page.locator('.panel-left').innerText()
  ok(/supabase/i.test(leftText), '项目信息来自真实 API')
  ok(/Star/i.test(leftText), '指标区含 Star')
  ok(/[0-9]/.test(leftText), '指标数值存在')

  // 素材：README 图 / 社交预览图应当出现在素材区
  await page.waitForTimeout(1500)
  const tiles = await page.locator('.panel-left .asset-tile img').count()
  ok(tiles >= 1, `素材缩略图 ${tiles} 张（README 图 / 社交预览图）`)

  console.log('\n=== 静态版导出三种比例 ===')
  for (const ratio of [
    { key: '16:9', expect: [2400, 1350] },
    { key: '1:1', expect: [1800, 1800] },
    { key: '3:4', expect: [1800, 2400] },
  ]) {
    await page.locator('.stage-bar .seg-item', { hasText: ratio.key }).first().click()
    await page.waitForTimeout(900)
    await page.click('button:has-text("导出 PNG")')
    await page.waitForSelector('.modal')
    const dl = page.waitForEvent('download', { timeout: 60000 })
    await page.locator('.modal-foot button', { hasText: `导出 ${ratio.key} PNG` }).click()
    const download = await dl
    const file = path.join(outDir, `static-real-${download.suggestedFilename()}`)
    await download.saveAs(file)
    const size = pngSize(fs.readFileSync(file))
    ok(size !== null, `${ratio.key} PNG 有效`, path.basename(file))
    ok(size && size.width === ratio.expect[0] && size.height === ratio.expect[1], `${ratio.key} 尺寸 ${size?.width}×${size?.height}`)
    await page.click('.modal-foot button:has-text("关闭")')
    await page.waitForTimeout(250)
  }

  // 画布真的画了东西
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('.stage-viewport canvas')
    if (!canvas) return { ok: false }
    const ctx = canvas.getContext('2d')
    const d = ctx.getImageData(0, 0, Math.min(180, canvas.width), Math.min(180, canvas.height)).data
    let nonBg = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < 250) nonBg++
    return { ok: nonBg > 100, nonBg }
  })
  ok(painted.ok, `画布已绘制内容（${painted.nonBg} 像素非背景）`)

  ok(errors.length === 0, `无脚本错误（${errors.length}）`, errors.slice(0, 2).join(' | '))
  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
  if (failed) process.exitCode = 1
} catch (error) {
  console.error('\n测试失败：', error.message)
  await page.screenshot({ path: path.join(outDir, 'static-real-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
