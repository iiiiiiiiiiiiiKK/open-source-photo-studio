// 提交前安全检查：扫描所有被 Git 跟踪的文件，找出不该进入公开仓库的凭据。
// 用法：node scripts/scan-secrets.mjs
//
// 设计原则：
// 1) 这里只写"凭据的形态"（正则），绝不写任何真实凭据值；
// 2) 命中时只报告文件名与行号，不回显匹配内容，避免把凭据又打印进日志。
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const patterns = [
  ['GitHub classic token', /ghp_[A-Za-z0-9]{30,}/],
  ['GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{40,}/],
  ['Cloudflare API token', /cfat_[A-Za-z0-9]{20,}/],
  ['Cloudflare R2 token', /cfut_[A-Za-z0-9]{20,}/],
  ['OpenAI / DeepSeek style key', /sk-[A-Za-z0-9]{24,}/],
  ['Bearer with long literal', /Bearer\s+[A-Za-z0-9._-]{24,}/],
  ['AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['private key block', /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
]

// 这几个文件天然包含"形似凭据"的字符串（正则本身 / 空占位 / 文档示例），跳过以免误报
const ALLOWED = [/^scripts\/scan-secrets\.mjs$/, /^\.env\.example$/, /^README\.md$/]

const files = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

const findings = []

for (const file of files) {
  if (ALLOWED.some((re) => re.test(file))) continue
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(file)) continue
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const [name, re] of patterns) {
      if (re.test(lines[i])) findings.push({ file, line: i + 1, name })
    }
  }
}

console.log(`scanned ${files.length} tracked files with ${patterns.length} patterns`)
if (findings.length === 0) {
  console.log('ok: no credentials in tracked files')
} else {
  console.log(`WARN: ${findings.length} potential findings (content redacted):`)
  for (const f of findings) console.log(`  ${f.file}:${f.line}  [${f.name}]`)
  console.log('')
  console.log('处理建议：改用环境变量；若已推送过，请立即在服务商后台吊销并轮换该凭据。')
  process.exitCode = 1
}