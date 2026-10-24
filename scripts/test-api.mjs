// 接口自测：真实调用 GitHub 公开仓库与示例站点，验证元信息、截图与文案。
// 用法：node scripts/test-api.mjs
const BASE = process.env.API_BASE || 'http://127.0.0.1:8931'

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

async function post(path, body, timeout = 120000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text.slice(0, 300) }
    }
    return { status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, res }
}

function pngInfo(buffer) {
  if (buffer.length < 24 || buffer.slice(1, 4).toString() !== 'PNG') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

console.log('\n=== 1. 健康检查 ===')
{
  const { status, res } = await get('/api/health')
  const health = await res.json()
  ok(status === 200 && health.ok === true, '服务在线')
  ok(typeof health.screenshot.available === 'boolean', `截图能力：${health.screenshot.available ? '可用' : '不可用'}`)
  ok(health.ai && health.ai.enabled === false, '未配置 API Key 时 AI 关闭（本地文案仍可用）')
  ok(health.viewports.length >= 5, `${health.viewports.length} 种截图视口`)
}

console.log('\n=== 2. GitHub 真实仓库元信息 ===')
let githubPayload = null
{
  const { status, json } = await post('/api/extract', { url: 'https://github.com/facebook/react', withScreenshot: true })
  githubPayload = json
  ok(status === 200 && json.ok, '提取成功')
  const p = json.project
  ok(p.name === 'react' && p.owner, `项目名 ${p.fullName}（owner: ${p.owner}）`)
  ok(p.stars > 100000, `Star 数 ${p.stars}（真实值）`)
  ok(p.language === 'JavaScript', `主要语言 ${p.language}`)
  ok(p.license === 'MIT', `许可证 ${p.license}`)
  ok(Array.isArray(p.topics) && p.topics.length > 0, `Topics ${p.topics?.length} 个`)
  ok(p.repoUrl === 'https://github.com/facebook/react', '仓库地址正确')
  ok(p.languages.length >= 2, `语言构成 ${p.languages.length} 项`)
  ok(p.readmeRawTruncated.length > 500, `README 已获取 ${p.readmeRawTruncated.length} 字符`)
  ok(p.pushedAt && Date.parse(p.pushedAt) > 0, `最近提交 ${p.pushedAt}`)

  const c = json.copy
  ok(c.oneLiner.includes('react'), '一句话介绍包含项目名')
  ok(c.highlights.length >= 3 && c.highlights.length <= 5, `亮点 ${c.highlights.length} 条`)
  ok(c.highlights.every((h) => h.evidence), '每条亮点都有出处标记')
  ok(c.metrics.some((m) => m.key === 'stars' && m.known), 'Star 指标标记为已知')
  ok(c.facts.length >= 2, `原始资料 ${c.facts.length} 条`)
  ok(c.mode === 'deterministic', '无 API Key 时使用本地文案模式')

  ok(json.shot && json.shot.width > 0, `截图尺寸 ${json.shot?.width}×${json.shot?.height}`)
}

console.log('\n=== 3. 截图文件真实有效 ===')
if (githubPayload?.shot) {
  const { status, res } = await get(githubPayload.shot.url)
  const buffer = Buffer.from(await res.arrayBuffer())
  const info = pngInfo(buffer)
  ok(status === 200 && info !== null, '返回 PNG 文件')
  ok(info.width === githubPayload.shot.width && info.height === githubPayload.shot.height, `尺寸一致 ${info.width}×${info.height}`)
  ok(buffer.length > 20000, `文件大小 ${(buffer.length / 1024).toFixed(0)} KB`)
}

console.log('\n=== 4. 普通网站元信息 ===')
{
  const { status, json } = await post('/api/extract', { url: 'https://example.com', withScreenshot: false })
  ok(status === 200 && json.ok, '网站提取成功')
  ok(json.project.source === 'website', '识别为网站来源')
  ok(/Example Domain/i.test(json.project.title), `页面标题「${json.project.title}」`)
  ok(json.copy.oneLiner.length > 5, '生成了中文一句话介绍')
}

console.log('\n=== 5. 手动模式（不访问网络） ===')
{
  const { status, json } = await post('/api/manual', {
    name: 'internal-tool',
    description: '内网使用的构建工具',
    url: '',
    owner: 'team',
    tags: ['typescript', 'cli'],
  })
  ok(status === 200 && json.ok, '手动创建成功')
  ok(json.project.source === 'manual', '来源标记为手动')
  ok(json.project.notes.length > 0, '提示信息未经核验')
  ok(json.copy.highlights.length >= 1, '仍能生成基础文案')
  const missing = json.copy.metrics.every((m) => !m.known)
  ok(missing, '手动模式下指标全部标记未知（不编造）')
}

console.log('\n=== 6. 异常输入 ===')
{
  const cases = [
    { url: '', label: '空网址' },
    { url: 'not a url', label: '非法字符串' },
    { url: 'ftp://example.com/file', label: 'FTP 协议' },
    { url: 'https://github.com/this-owner-should-not-exist-xyz/nope-repo-xyz', label: '不存在的仓库' },
  ]
  for (const item of cases) {
    const { status, json } = await post('/api/extract', { url: item.url })
    ok(status >= 400 && status < 600 && json.error, `${item.label} → ${status} ${json.error || ''}`)
    ok(typeof json.message === 'string' && json.message.length > 0, `${item.label} 有中文错误说明`)
  }
}

console.log('\n=== 7. 截图接口独立调用 ===')
{
  const { status, json } = await post('/api/screenshot', {
    url: 'https://example.com',
    viewport: 'desktop-1280',
  })
  ok(status === 200 && json.ok, `截图接口返回成功`+(json.error ? ` 失败原因：`+json.error+` `+(json.message||``) : ``))
  ok(typeof json.url === 'string' && json.url.startsWith('/api/screenshot/'), `返回可访问的截图地址 `+``)
}

console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
if (failed > 0) process.exitCode = 1



