import { describe, expect, it, vi } from 'vitest'

import { createUpdateService, type UpdateAdapter } from '../update-service'

const createFakeAdapter = () => {
  let checkingListener: (() => void) | undefined
  let availableListener: ((version: string) => void) | undefined
  let notAvailableListener: ((version: string) => void) | undefined
  let progressListener: ((percent: number) => void) | undefined
  let downloadedListener: ((version: string) => void) | undefined
  let errorListener: ((message: string) => void) | undefined

  const adapter: UpdateAdapter = {
    onCheckingForUpdate: (listener) => {
      checkingListener = listener
      return () => undefined
    },
    onUpdateAvailable: (listener) => {
      availableListener = listener
      return () => undefined
    },
    onUpdateNotAvailable: (listener) => {
      notAvailableListener = listener
      return () => undefined
    },
    onDownloadProgress: (listener) => {
      progressListener = listener
      return () => undefined
    },
    onUpdateDownloaded: (listener) => {
      downloadedListener = listener
      return () => undefined
    },
    onError: (listener) => {
      errorListener = listener
      return () => undefined
    },
    checkForUpdates: vi.fn(async () => {
      checkingListener?.()
      availableListener?.('1.0.0-dev.2')
    }),
    downloadUpdate: vi.fn(async () => {
      progressListener?.(38.7)
      downloadedListener?.('1.0.0-dev.2')
    }),
    quitAndInstall: vi.fn(),
  }

  return { adapter, notAvailableListener, errorListener }
}

describe('createUpdateService', () => {
  it('在发现更新后自动下载，并在下载完成后允许安装', async () => {
    const { adapter } = createFakeAdapter()
    const service = createUpdateService({ adapter, currentVersion: '1.0.0-dev.1', isPackaged: true })

    await service.checkForUpdates()

    expect(adapter.checkForUpdates).toHaveBeenCalledOnce()
    expect(adapter.downloadUpdate).toHaveBeenCalledOnce()
    expect(service.getState()).toEqual({
      status: 'downloaded',
      currentVersion: '1.0.0-dev.1',
      availableVersion: '1.0.0-dev.2',
      downloadPercent: 100,
      message: '新版本 1.0.0-dev.2 已下载完成。',
    })

    service.install()
    expect(adapter.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('开发模式不访问 GitHub 更新服务', async () => {
    const { adapter } = createFakeAdapter()
    const service = createUpdateService({ adapter, currentVersion: '1.0.0-dev.1', isPackaged: false })

    await service.checkForUpdates()

    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(service.getState()).toEqual({
      status: 'idle',
      currentVersion: '1.0.0-dev.1',
      message: '开发模式不检查更新。',
    })
  })

  it('检查异常只转成错误状态，不向启动流程抛出异常', async () => {
    const { adapter } = createFakeAdapter()
    adapter.checkForUpdates = vi.fn(async () => {
      throw new Error('network unavailable')
    })
    const service = createUpdateService({ adapter, currentVersion: '1.0.0-dev.1', isPackaged: true })

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      status: 'error',
      message: '检查更新失败：network unavailable',
    })
  })
})
