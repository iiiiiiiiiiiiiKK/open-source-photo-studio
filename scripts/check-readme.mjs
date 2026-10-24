// GitHub 仓库 README 与资源的完整性检查（走 api.github.com / raw.githubusercontent.com，
// 因为本机网络访问 github.com 的 HTML 会被拦）
const OWNER = 'iiiiiiiiiiiiiKK'
const REPO = 'open-source-photo-studio'
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main`

let passed = 0
let failed = 0
function ok(cond, label, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ''}`)
  } else {
    failed++
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`)
  }
}

// 1) README 内容检查
const readmeRes = await fetch(`${RAW}/README.md`, { signal: AbortSignal.timeout(30000) })
const readme = await readmeRes.text()
console.log(`\n=== README（${readmeRes.status}，${readme.length} 字符）===`)
ok(readmeRes.ok, 'README 可访问')
ok(readme.includes('x.com/0xkillcoin'), '包含 X 超链接 @0xkillcoin')
ok(readme.includes('docs/assets/reward.jpg'), '包含打赏码图片引用')
ok(readme.includes('iiiiiiiiiiiiiKK.github.io/open-source-photo-studio'), '包含在线体验链接')
ok(readme.includes('## 目录'), '包含目录')
ok(readme.includes('开发者终端风') && readme.includes('技术架构介绍图'), '包含六种模板说明')
ok(readme.includes('## 安全性'), '包含安全章节')
ok(readme.includes('## 部署'), '包含部署章节')
ok(readme.includes('## 已知限制'), '包含已知限制')
ok(readme.includes('MIT'), '包含许可证说明')
console.log(`  章节数：${(readme.match(/^## /gm) || []).length}`)

// 2) README 引用的本地图片都存在
const localImages = [...readme.matchAll(/src="(docs\/assets\/[^"]+)"|\((docs\/assets\/[^)]+)\)/g)]
  .map((m) => m[1] || m[2])
  .filter(Boolean)
const uniqueImages = [...new Set(localImages)]
console.log(`\n=== README 本地图片（${uniqueImages.length} 张）===`)
for (const rel of uniqueImages) {
  const res = await fetch(`${RAW}/${rel}`, { method: 'HEAD', signal: AbortSignal.timeout(25000) }).catch(() => null)
  ok(res?.ok, rel, res ? `${res.status} ${res.headers.get('content-type')}` : 'fetch failed')
}

// 3) 关键文件都在
console.log('\n=== 关键文件 ===')
const files = [
  'package.json',
  'LICENSE',
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',
  '.github/workflows/deploy-pages.yml',
  'server/index.mjs',
  'server/lib/url-guard.mjs',
  'shared/copywriter.mjs',
  'src/App.tsx',
  'vite.config.ts',
]
for (const file of files) {
  const res = await fetch(`${RAW}/${file}`, { method: 'HEAD', signal: AbortSignal.timeout(25000) }).catch(() => null)
  ok(res?.ok, file, res ? String(res.status) : 'fetch failed')
}

console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`)
if (failed) process.exitCode = 1
