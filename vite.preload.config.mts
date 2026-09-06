import path from 'node:path'
import { defineConfig } from 'vite'

/**
 * Electron 开启 sandbox 后，preload 不能在运行时 require 任意本地模块。
 * 因此 preload 必须打成单文件 CommonJS，shared/contracts 中的 channel 常量会被内联，
 * 只把 Electron 自带模块保留为 external；这不会扩大 Renderer 可访问的能力。
 */
export default defineConfig({
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-electron'),
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    target: 'node22',
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/preload.ts'),
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    rollupOptions: {
      external: ['electron'],
      output: { codeSplitting: false },
    },
  },
})
