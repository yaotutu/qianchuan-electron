import { defineConfig } from 'vitest/config'

/** 测试配置覆盖 Renderer 与 Electron 主进程的纯函数测试。 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
