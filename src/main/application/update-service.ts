import type { AppUpdateState } from '../../shared/contracts/app-update'

/** 主进程更新适配器需要的最小能力，具体 Electron API 留在 infrastructure。 */
export type UpdateAdapter = {
  onCheckingForUpdate: (listener: () => void) => () => void
  onUpdateAvailable: (listener: (version: string) => void) => () => void
  onUpdateNotAvailable: (listener: (version: string) => void) => () => void
  onDownloadProgress: (listener: (percent: number) => void) => () => void
  onUpdateDownloaded: (listener: (version: string) => void) => () => void
  onError: (listener: (message: string) => void) => () => void
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: () => void
}

type UpdateServiceDependencies = {
  adapter: UpdateAdapter
  currentVersion: string
  isPackaged: boolean
}

export type UpdateService = {
  getState: () => AppUpdateState
  checkForUpdates: () => Promise<AppUpdateState>
  install: () => AppUpdateState
  onStateChange: (listener: (state: AppUpdateState) => void) => () => void
  dispose: () => void
}

/**
 * 更新用例只编排状态转换和副作用调用：
 * - 启动检查/下载失败不会抛到应用启动链路，避免更新故障阻塞主窗口；
 * - 下载完成后只通知 Renderer，由用户主动点击重启安装；
 * - 开发模式完全跳过检查，防止本地 Vite 运行误触发线上更新。
 */
export const createUpdateService = ({
  adapter,
  currentVersion,
  isPackaged,
}: UpdateServiceDependencies): UpdateService => {
  let state: AppUpdateState = {
    status: 'idle',
    currentVersion,
    message: isPackaged ? undefined : '开发模式不检查更新。',
  }
  const listeners = new Set<(nextState: AppUpdateState) => void>()
  const cleanups = [
    adapter.onCheckingForUpdate(() => {
      if (isPackaged) setState({ status: 'checking', message: '正在检查新版本…' })
    }),
    adapter.onUpdateAvailable((version) => {
      if (!isPackaged) return
      setState({ status: 'available', availableVersion: version, message: `发现新版本 ${version}，正在下载…` })
      void downloadUpdate()
    }),
    adapter.onUpdateNotAvailable((version) => {
      if (isPackaged) setState({ status: 'up-to-date', availableVersion: version, message: '当前已是最新版本。' })
    }),
    adapter.onDownloadProgress((percent) => {
      if (isPackaged) {
        setState({
          status: 'downloading',
          downloadPercent: Math.max(0, Math.min(100, percent)),
          message: '正在下载更新…',
        })
      }
    }),
    adapter.onUpdateDownloaded((version) => {
      if (isPackaged) {
        setState({
          status: 'downloaded',
          availableVersion: version,
          downloadPercent: 100,
          message: `新版本 ${version} 已下载完成。`,
        })
      }
    }),
    adapter.onError((message) => {
      if (isPackaged) setState({ status: 'error', message: `检查更新失败：${message}` })
    }),
  ]

  const setState = (next: Pick<AppUpdateState, 'status'> & Partial<Omit<AppUpdateState, 'status'>>) => {
    state = { currentVersion, ...next }
    listeners.forEach((listener) => listener(state))
  }

  const downloadUpdate = async () => {
    try {
      await adapter.downloadUpdate()
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载更新失败。'
      setState({ status: 'error', message: `下载更新失败：${message}` })
    }
  }

  const checkForUpdates = async () => {
    if (!isPackaged) return state
    setState({ status: 'checking', message: '正在检查新版本…' })
    try {
      await adapter.checkForUpdates()
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败。'
      setState({ status: 'error', message: `检查更新失败：${message}` })
    }
    return state
  }

  return {
    getState: () => state,
    checkForUpdates,
    install: () => {
      if (state.status === 'downloaded') adapter.quitAndInstall()
      return state
    },
    onStateChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => cleanups.forEach((cleanup) => cleanup()),
  }
}
