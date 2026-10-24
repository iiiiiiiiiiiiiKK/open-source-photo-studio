// 静态版冒烟测试：把 dist-static 挂在子路径下静态托管，验证
// 1) 页面能加载、能探测到静态模式
// 2) 非 GitHub 网址给出明确的中文限制说明（不假装成功）
// 3) 只靠浏览器直连 GitHub 能抓到真实元信息（若本机 IP 配额耗尽则标记 SKIP，不算失败）
// 4) 三种比例都能导出 PNG（用离线手动模式验证，不依赖 GitHub）
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
const PORT = 5271
fs.mkdirSync(outDir, { recursive: true })

if (!fs.existsSync(siteDir)) {
  console.error('缺少 dist-static，请先运行：STATIC=1 BASE=/open-source-photo-studio/ npm run build')
  process.exit(1)
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  if (!url.startsWith(BASE_PATH)) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  let rel = url.slice(BASE_PATH.length) || 'index.html'
  if (rel.endsWith('/')) rel += 'index.html'
  const file = path.join(siteDir, rel)
  if (!file.startsWith(siteDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${PORT}${BASE_PATH}`
console.log(`静态站点：${origin}`)

let passed = 0
let failed = 0
let skipped = 0
function ok(condition, message, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}${extra ? ` — ${extra}` : ''}`)
  } else {
    failed++
    console.error(`  ✗ ${message}${extra ? ` — ${extra}` : ''}`)
  }
}
function skip(message, reason = '') {
  skipped++
  console.log(`  ⊘ SKIP ${message}${reason ? ` — ${reason}` : ''}`)
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

/** 导出当前设计稿的三种比例，返回校验结果 */
async function exportAllRatios(prefix) {
  const ratios = [
    { key: '16:9', expect: [2400, 1350] },
    { key: '1:1', expect: [1800, 1800] },
    { key: '3:4', expect: [1800, 2400] },
  ]
  const saved = []
  for (const ratio of ratios) {
    await page.locator('.stage-bar .seg-item', { hasText: ratio.key }).first().click()
    await page.waitForTimeout(800)
    await page.click('button:has-text("导出 PNG")')
    await page.waitForSelector('.modal')
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 })
    await page.locator('.modal-foot button', { hasText: `导出 ${ratio.key} PNG` }).click()
    const download = await downloadPromise
    const file = path.join(outDir, `${prefix}-${download.suggestedFilename()}`)
    await download.saveAs(file)
    const size = pngSize(fs.readFileSync(file))
    ok(size !== null, `${ratio.key} 生成有效 PNG`, path.basename(file))
    ok(size && size.width === ratio.expect[0] && size.height === ratio.expect[1], `${ratio.key} 尺寸 ${size?.width}×${size?.height}`)
    saved.push({ ratio: ratio.key, size })
    await page.click('.modal-foot button:has-text("关闭")')
    await page.waitForTimeout(300)
  }
  return saved
}

try {
  console.log('\n=== 1. 页面与模式探测 ===')
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.landing-title', { timeout: 20000 })
  ok(true, '静态站点加载成功')
  const eyebrow = await page.locator('.landing-eyebrow').innerText()
  ok(/静态/.test(eyebrow), '首页标记为静态版', eyebrow.replace(/\n/g, ' '))
  const warnShown = await page.locator('.status-line[data-tone="warn"]').first().isVisible().catch(() => false)
  ok(warnShown, '显示静态版能力限制提示')

  console.log('\n=== 2. 非 GitHub 网址给出明确限制 ===')
  await page.fill('input[aria-label="项目地址"]', 'https://example.com')
  await page.click('button:has-text("读取项目")')
  await page.waitForSelector('.status-line[data-tone="err"]', { timeout: 30000 })
  const errText = await page.locator('.status-line[data-tone="err"]').first().innerText()
  ok(/静态版|GitHub/.test(errText), '提示静态版限制', errText.split('\n').slice(0, 2).join(' ').slice(0, 76))

  console.log('\n=== 3. 浏览器直连 GitHub 抓真实元信息 ===')
  await page.fill('input[aria-label="项目地址"]', 'https://github.com/facebook/react')
  await page.click('button:has-text("读取项目")')
  // 先判断是否是配额耗尽（本机公网 IP 匿名配额 60/小时）
  const outcome = await Promise.race([
    page.waitForSelector('.workspace', { timeout: 60000 }).then(() => 'workspace'),
    page.waitForFunction(() => document.body.innerText.includes('配额'), { timeout: 60000 }).then(() => 'ratelimit'),
  ]).catch(() => 'timeout')

  if (outcome === 'workspace') {
    await page.waitForTimeout(2500)
    const title = await page.inputValue('input[placeholder="项目名称"]')
    ok(/react/i.test(title), '标题已填充', title)
    const oneLiner = await page.inputValue('textarea[placeholder*="用一句中文"]')
    ok(oneLiner.length > 20, `一句话介绍已生成（${oneLiner.length} 字）`)
    const hl = await page.locator('.hl-row textarea').count()
    ok(hl >= 3, `亮点 ${hl} 条`)
    const metrics = await page.locator('.panel-left').innerText()
    ok(/Star/i.test(metrics), '指标区包含 Star')
    ok(/251|25\.\d\s*万|251k/i.test(metrics), 'Star 接近真实值（约 251k）')

    console.log('\n=== 4. 用真实项目导出三种比例 ===')
    await exportAllRatios('static-react')
    await page.click('button:has-text("换一个项目")')
    await page.waitForSelector('.landing-title')
  } else if (outcome === 'ratelimit') {
    const text = await page.locator('.status-line[data-tone="err"]').first().innerText().catch(() => '')
    skip('GitHub 直连抓取', '本机公网 IP 的匿名配额已用完（60/小时）—— 这是 GitHub 侧限制，与代码无关')
    ok(/配额/.test(text), '配额耗尽时给出明确中文说明', text.split('\n').slice(0, 2).join(' ').slice(0, 70))
    ok(/服务端模式|npm start|手动/.test(text), '同时给出替代路径（服务端模式 / 手动填写）')
    await page.click('button:has-text("换一个项目")').catch(() => {})
    await page.waitForSelector('.landing-title', { timeout: 20000 }).catch(() => {})
  } else {
    ok(false, 'GitHub 抓取既未成功也未给出配额提示（超时）')
  }

  console.log('\n=== 5. 手动模式 + 三种比例导出（完全离线） ===')
  await page.click('button:has-text("手动填写项目信息")')
  await page.waitForSelector('.modal')
  await page.fill('.modal input[placeholder*="my-awesome-lib"]', '静态版手动测试')
  await page.fill('.modal textarea[placeholder*="这是一个用来"]', '验证静态部署下也能手动完成排版与导出，全程不访问任何网络。')
  await page.fill('.modal input[placeholder="owner"]', 'studio')
  await page.fill('.modal input[placeholder*="typescript, cli"]', 'canvas, typescript, offline')
  await page.fill('.modal textarea[placeholder*="零配置启动"]', '静态托管可直接用\n离线排版\n三种比例导出')
  await page.click('.modal-foot button:has-text("进入工作台")')
  await page.waitForSelector('.workspace', { timeout: 30000 })
  await page.waitForTimeout(2000)
  const manualTitle = await page.inputValue('input[placeholder="项目名称"]')
  ok(manualTitle === '静态版手动测试', '手动模式进入工作台', manualTitle)
  const hlCount = await page.locator('.hl-row textarea').count()
  ok(hlCount === 3, `手动亮点 ${hlCount} 条`)

  console.log('\n=== 6. 手动模式导出三种比例 ===')
  await exportAllRatios('static-manual')

  ok(errors.length === 0, `全程无脚本错误（${errors.length}）`, errors.slice(0, 3).join(' | '))
  console.log(`\n=== 结果：${passed} 通过，${failed} 失败，${skipped} 跳过 ===`)
  if (failed) process.exitCode = 1
} catch (error) {
  console.error('\n测试失败：', error.message)
  await page.screenshot({ path: path.join(outDir, 'static-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
