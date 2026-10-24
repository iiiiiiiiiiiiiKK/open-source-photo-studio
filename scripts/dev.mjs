// 简单的开发脚本：同时启动 API 服务与 Vite 开发服务器。
// 用法：npm run dev
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const children = []
function run(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  })
  child.on('exit', (code) => {
    console.log(`[dev] ${name} 退出，代码 ${code}`)
    shutdown(code ?? 0)
  })
  children.push(child)
  return child
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('api', process.execPath, [path.join(root, 'server', 'index.mjs')])
run('web', npmCmd, ['run', 'dev:web'])
