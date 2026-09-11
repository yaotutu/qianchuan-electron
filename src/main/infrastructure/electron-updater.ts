import { autoUpdater, type AppUpdater } from 'electron-updater'

import type { UpdateAdapter } from '../application/update-service'

/**
 * electron-updater 的事件和复杂对象只在主进程适配器中出现，应用层不依赖 Electron。
 * GitHub 仓库地址由 electron-builder.yml 生成到打包产物的 app-update.yml 中。
 */
export const createElectronUpdater = (updater: AppUpdater = autoUpdater): UpdateAdapter => {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  // DEV Release 是普通 Release，但版本号带 dev 预发布段；显式允许该版本通道。
  updater.allowPrerelease = true

  return {
    onCheckingForUpdate: (listener) => {
      updater.on('checking-for-update', listener)
      return () => updater.removeListener('checking-for-update', listener)
    },
    onUpdateAvailable: (listener) => {
      const handler = (info: { version: string }) => listener(info.version)
      updater.on('update-available', handler)
      return () => updater.removeListener('update-available', handler)
    },
    onUpdateNotAvailable: (listener) => {
      const handler = (info: { version: string }) => listener(info.version)
      updater.on('update-not-available', handler)
      return () => updater.removeListener('update-not-available', handler)
    },
    onDownloadProgress: (listener) => {
      const handler = (info: { percent: number }) => listener(info.percent)
      updater.on('download-progress', handler)
      return () => updater.removeListener('download-progress', handler)
    },
    onUpdateDownloaded: (listener) => {
      const handler = (event: { version: string }) => listener(event.version)
      updater.on('update-downloaded', handler)
      return () => updater.removeListener('update-downloaded', handler)
    },
    onError: (listener) => {
      const handler = (error: Error) => listener(error.message)
      updater.on('error', handler)
      return () => updater.removeListener('error', handler)
    },
    checkForUpdates: () => updater.checkForUpdates(),
    downloadUpdate: () => updater.downloadUpdate(),
    quitAndInstall: () => updater.quitAndInstall(),
  }
}
