import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = path.join(projectDirectory, 'src')
const electronBinary = require('electron')
const typeScriptBinary = require.resolve('typescript/bin/tsc')
// Vite 8 的 package exports 不导出 bin/vite.js；先解析公开的 package.json，再拼接实际 CLI 路径，兼容 npm 安装和本地 node_modules。
const vitePackageDirectory = path.dirname(require.resolve('vite/package.json'))
const viteBinary = path.join(vitePackageDirectory, 'bin/vite.js')
const rendererUrl = process.env.QIANCHUAN_RENDERER_URL || 'http://127.0.0.1:5173'

let electronProcess = null
let compilationProcess = null
let compileTimer = null
let compilationInProgress = false
let compilationQueued = false
let isStopping = false

/**
 * Electron 主进程和 preload 不能像 Vite Renderer 一样热更新。
 * 每次相关 TypeScript 源码变化后都先完成一次编译，再完整重启 Electron，避免页面已经使用新 IPC、
 * 但主进程仍停留在旧版本，从而出现“没有注册 IPC handler”一类假性读取失败。
 */
const startElectron = () => {
  if (isStopping) return
  electronProcess = spawn(electronBinary, ['.'], {
    cwd: projectDirectory,
    env: { ...process.env, QIANCHUAN_RENDERER_URL: rendererUrl },
    stdio: 'inherit',
  })
  electronProcess.on('exit', (code, signal) => {
    electronProcess = null
    if (!isStopping && code && signal === null) {
      console.error(`[dev:electron] Electron 异常退出，退出码：${code}`)
    }
  })
}

/** 先礼貌结束旧进程；超时后再强制终止，防止连续编译产生多个 Electron 实例。 */
const stopElectron = () =>
  new Promise((resolve) => {
    const child = electronProcess
    if (!child || child.exitCode !== null || child.killed) {
      resolve()
      return
    }

    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL')
    }, 3_000)
    child.once('exit', () => {
      clearTimeout(forceKillTimer)
      resolve()
    })
    child.kill('SIGTERM')
  })

const restartElectron = async () => {
  console.log('[dev:electron] 主进程或 preload 已更新，正在重启 Electron…')
  await stopElectron()
  startElectron()
}

/** 只监听 Electron 边界代码；修改 React Renderer 时仍由 Vite HMR 处理，不做整窗重启。 */
const isElectronSource = (filename) => {
  const normalized = String(filename || '').replaceAll('\\', '/')
  return (
    normalized === 'main.ts' ||
    normalized === 'preload.ts' ||
    normalized.startsWith('main/') ||
    normalized.startsWith('shared/contracts/')
  )
}

const runBuildProcess = (binary, args) =>
  new Promise((resolve) => {
    compilationProcess = spawn(process.execPath, [binary, ...args], {
      cwd: projectDirectory,
      stdio: 'inherit',
    })
    compilationProcess.once('exit', (code) => {
      compilationProcess = null
      resolve(code ?? 1)
    })
  })

const runTypeScriptBuild = () => runBuildProcess(typeScriptBinary, ['-p', 'tsconfig.electron.json'])
const runPreloadBuild = () => runBuildProcess(viteBinary, ['build', '--config', 'vite.preload.config.mts'])

/** 编译期间如果又有保存动作，只额外补做最后一次编译，避免并发写 dist-electron。 */
const compileAndRestart = async () => {
  if (isStopping) return
  if (compilationInProgress) {
    compilationQueued = true
    return
  }

  compilationInProgress = true
  compilationQueued = false
  const typeScriptExitCode = await runTypeScriptBuild()
  const preloadExitCode = typeScriptExitCode === 0 ? await runPreloadBuild() : 1
  if (preloadExitCode === 0) await restartElectron()
  else console.error('[dev:electron] 主进程或 preload 构建失败，已保留当前 Electron 实例。')
  compilationInProgress = false

  if (compilationQueued) void compileAndRestart()
}

/** 一次保存可能产生多个文件事件，统一防抖后只编译和重启一次。 */
const scheduleCompile = () => {
  if (isStopping) return
  if (compileTimer) clearTimeout(compileTimer)
  compileTimer = setTimeout(() => {
    compileTimer = null
    void compileAndRestart()
  }, 200)
}

const sourceWatcher = watch(sourceDirectory, { recursive: true }, (_eventType, filename) => {
  if (isElectronSource(filename)) scheduleCompile()
})

/** concurrently 结束任意一个开发服务时，会向本脚本发送终止信号；这里统一回收子进程。 */
const shutdown = async (signal) => {
  if (isStopping) return
  isStopping = true
  if (compileTimer) clearTimeout(compileTimer)
  sourceWatcher.close()
  compilationProcess?.kill(signal)
  await stopElectron()
  process.exit(0)
}

;['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => {
  process.on(signal, () => void shutdown(signal))
})

startElectron()
