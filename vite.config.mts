import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * Renderer 使用独立的 Vite 构建入口，Electron 主进程由 tsconfig.electron.json 单独编译。
 * 两条构建链只通过 shared/contracts 中的内部契约协作，不改变独立 OAuth 服务端的 HTTP 协议。
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
