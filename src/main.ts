import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'

import { createAuthService } from './main/application/auth-service'
import { createMonitorTaskService } from './main/application/monitor-task-service'
import { createPromotionPlanService } from './main/application/promotion-plan-service'
import { createQianchuanApiClient } from './main/infrastructure/qianchuan-api-client'
import { notifyMonitorTask } from './main/infrastructure/electron-monitor-notifier'
import { createJsonMonitorTaskRepository } from './main/infrastructure/json-monitor-task-repository'
import { createOAuthServerClient } from './main/infrastructure/oauth-server-client'
import { registerIpcHandlers } from './main/ipc/register-ipc-handlers'
import { createMonitorScheduler } from './main/monitor-scheduler'
import { createMonitorTaskStore } from './main/monitor-task-store'
import { createMainWindow } from './main/windows/main-window'
import { IPC_CHANNELS } from './shared/contracts/ipc'

/**
 * OAuth 服务是独立部署的外部依赖，Electron 仅通过稳定 HTTP 契约访问它。
 * 地址只在主进程读取，不会传给 Renderer。
 */
const oauthServerUrl = process.env.QIANCHUAN_OAUTH_SERVER_URL || 'http://127.0.0.1:3100'
const rendererUrl = process.env.QIANCHUAN_RENDERER_URL
const mainWindowOptions = {
  rendererUrl,
  preloadPath: path.join(__dirname, 'preload.js'),
  rendererFilePath: path.join(__dirname, '../dist/index.html'),
}
let monitorScheduler: ReturnType<typeof createMonitorScheduler> | null = null

/** 主进程作为组合根，只负责创建依赖和管理 Electron 生命周期。 */
app.whenReady().then(() => {
  const oauthServerClient = createOAuthServerClient({ baseUrl: oauthServerUrl })
  const authService = createAuthService({
    client: oauthServerClient,
    openExternal: (url) => shell.openExternal(url),
  })

  // 千川 API 客户端：主进程直接调用巨量开放平台 API，不再经过服务端代理
  const qianchuanApiClient = createQianchuanApiClient()

  // auth-service 同时充当 TokenProvider，为千川 API 客户端提供 Access Token
  const promotionPlanService = createPromotionPlanService({
    apiClient: qianchuanApiClient,
    tokenProvider: authService,
  })

  const monitorTaskRepository = createJsonMonitorTaskRepository(
    path.join(app.getPath('userData'), 'monitor-tasks.json'),
  )
  const monitorTaskStore = createMonitorTaskStore(monitorTaskRepository)

  monitorScheduler = createMonitorScheduler({
    store: monitorTaskStore,
    fetchPlans: promotionPlanService.getAllForMonitor,
    notify: notifyMonitorTask,
    onTaskChanged: () => {
      BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(IPC_CHANNELS.monitorTask.changed))
    },
  })
  const monitorTaskService = createMonitorTaskService(monitorTaskStore, monitorScheduler)

  registerIpcHandlers({ authService, promotionPlanService, monitorTaskService })
  monitorScheduler.start()
  void createMainWindow(mainWindowOptions)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow(mainWindowOptions)
  })
})

app.on('before-quit', () => monitorScheduler?.stop())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
