import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * Renderer 使用独立的 Vite 构建入口，Electron 主进程仍然保留在 src/main.js。
 * 这样可以先迁移界面和状态管理，不改变现有 OAuth 服务端协议。
 */
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/renderer'),
  plugins: [react()],
  base: './',
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1_000,
  },
})
