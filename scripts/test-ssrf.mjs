// SSRF / 安全边界测试：确认服务端拒绝对内网、本机、云元数据、危险协议的访问。
// 用法：node scripts/test-ssrf.mjs
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

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { status: res.status, json }
}

async function getImage(url) {
  const res = await fetch(`${BASE}/api/image?url=${encodeURIComponent(url)}`)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, contentType: res.headers.get('content-type') || '', json }
}

console.log('\n=== 元信息接口：SSRF 目标必须被拒绝 ===')
const blockedTargets = [
  { url: 'http://127.0.0.1:8931/api/health', label: '本机回环 127.0.0.1' },
  { url: 'http://localhost:3000', label: 'localhost' },
  { url: 'http://169.254.169.254/latest/meta-data/', label: '云元数据 169.254.169.254' },
  { url: 'http://10.0.0.5/', label: '内网 10.0.0.5' },
  { url: 'http://192.168.1.1/', label: '内网 192.168.1.1' },
  { url: 'http://172.16.0.1/', label: '内网 172.16.0.1' },
  { url: 'http://[::1]/', label: 'IPv6 回环 ::1' },
  { url: 'http://[fd00::1]/', label: 'IPv6 唯一本地 fd00::1' },
  { url: 'http://0.0.0.0/', label: '0.0.0.0' },
  { url: 'file:///C:/Windows/win.ini', label: 'file:// 协议' },
  { url: 'gopher://example.com/', label: 'gopher:// 协议' },
  { url: 'http://metadata.google.internal/computeMetadata/v1/', label: 'GCP 元数据主机名' },
  { url: 'http://metadata/', label: 'metadata 主机名' },
  { url: 'http://router.local/', label: '*.local 域名' },
]

for (const target of blockedTargets) {
  const { status, json } = await post('/api/extract', { url: target.url })
  ok(status >= 400 && status < 500, `${target.label} 被拒绝`, `${status} ${json?.error || ''}`)
  ok(typeof json?.message === 'string' && json.message.length > 0, `${target.label} 返回中文原因`)
}

console.log('\n=== 截图接口：SSRF 目标必须被拒绝 ===')
for (const target of blockedTargets.slice(0, 8)) {
  const { status, json } = await post('/api/screenshot', { url: target.url })
  ok(status >= 400 && status < 500, `${target.label} 截图被拒绝`, `${status} ${json?.error || ''}`)
}

console.log('\n=== 图片代理：不许代理内网与非图片 ===')
{
  const cases = [
    { url: 'http://127.0.0.1:8931/api/health', label: '代理本机接口' },
    { url: 'http://169.254.169.254/latest/meta-data/', label: '代理元数据地址' },
    { url: 'file:///C:/Windows/win.ini', label: '代理 file://' },
  ]
  for (const item of cases) {
    const result = await getImage(item.url)
    ok(result.status >= 400, `${item.label} 被拒绝`, `${result.status}`)
  }

  const svg = await getImage('https://www.w3.org/2000/svg')
  ok(svg.status >= 400 || !String(svg.contentType).includes('svg'), 'SVG（可能含脚本）被拒绝', `${svg.status} ${svg.contentType}`)
}

console.log('\n=== 正常公网图片仍可代理 ===')
{
  const result = await getImage('https://avatars.githubusercontent.com/u/102812?v=4')
  ok(result.status === 200 && /^image\//.test(result.contentType), 'GitHub 头像代理成功', result.contentType)
}

console.log('\n=== 跳转到内网的重定向必须被拦截 ===')
{
  // httpbin 的重定向端点会把请求指向内网；服务端在跟随跳转时逐跳校验 IP。
  const { status, json } = await post('/api/extract', {
    url: 'https://httpbin.org/redirect-to?url=http://169.254.169.254/latest/meta-data/',
  })
  ok(status >= 400, '重定向到元数据地址被拦截', `${status} ${json?.error || ''}`)
  ok(
    ['IP_BLOCKED', 'HOST_BLOCKED', 'REDIRECT_BLOCKED', 'PROTOCOL_BLOCKED'].includes(json?.error),
    `错误码为 SSRF 相关：${json?.error}`
  )
}

console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
if (failed > 0) process.exitCode = 1
