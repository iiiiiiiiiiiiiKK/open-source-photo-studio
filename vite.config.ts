import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:8931'

// 部署到 GitHub Pages 时用静态构建：
//   STATIC=1 BASE=/<repo-name>/ npm run build
// STATIC=1 时前端不依赖 Node 服务端（真实截图能力会被明确禁用），产物可纯静态托管。
const STATIC = process.env.STATIC === '1'

export default defineConfig({
  plugins: [react()],
  base: process.env.BASE || '/',
  define: {
    'import.meta.env.VITE_STATIC_MODE': JSON.stringify(STATIC ? '1' : ''),
  },
  server: {
    port: 5199,
    strictPort: false,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    port: 5198,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    outDir: STATIC ? 'dist-static' : 'dist',
  },
})
