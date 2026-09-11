import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'

import { createAuthService } from './main/application/auth-service'
import { createMonitorTaskService } from './main/application/monitor-task-service'
import { createPromotionPlanService } from './main/application/promotion-plan-service'
import { createQianchuanApiClient } from './main/infrastructure/qianchuan-api-client'
import { createQianchuanPromotionPlanAdapter } from './main/infrastructure/qianchuan-promotion-plan-adapter'
import { notifyMonitorTask } from './main/infrastructure/electron-monitor-notifier'
import { createJsonMonitorTaskPersistence } from './main/infrastructure/json-monitor-task-persistence'
import { createOAuthServerClient } from './main/infrastructure/oauth-server-client'
import { createProductRefreshTokenStore } from './main/infrastructure/product-refresh-token-store'
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

/**
 * 主进程作为组合根，只负责创建依赖和管理 Electron 生命周期。
 *
 * 注意：两类 Access Token 都不落盘。应用重启后使用 safeStorage 中的产品 Refresh Token
 * 恢复产品会话，再按选中的 authorizationId 获取巨量短期 Access Token。
 */
app.whenReady().then(async () => {
  const oauthServerClient = createOAuthServerClient({ baseUrl: oauthServerUrl })
  const refreshTokenStore = createProductRefreshTokenStore({
    filePath: path.join(app.getPath('userData'), 'product-session.json'),
  })
  const authService = createAuthService({
    oauth: oauthServerClient,
    refreshTokenStore,
    openExternal: (url) => shell.openExternal(url),
  })

  // 千川 API 客户端：主进程直接调用巨量开放平台 API，不再经过服务端代理
  const qianchuanApiClient = createQianchuanApiClient()
  const promotionPlanPlatform = createQianchuanPromotionPlanAdapter({ apiClient: qianchuanApiClient })

  // auth-service 只提供主进程内存中的短期 Access Token；平台请求由适配器负责。
  const promotionPlanService = createPromotionPlanService({
    platform: promotionPlanPlatform,
    tokenProvider: authService,
  })

  const monitorTaskPersistence = createJsonMonitorTaskPersistence(
    path.join(app.getPath('userData'), 'monitor-tasks.json'),
  )
  const monitorTaskStore = createMonitorTaskStore(monitorTaskPersistence)

  monitorScheduler = createMonitorScheduler({
    store: monitorTaskStore,
    fetchPlans: promotionPlanService.getAllForMonitor,
    notify: notifyMonitorTask,
    onTaskChanged: () => {
      BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(IPC_CHANNELS.monitorTask.changed))
    },
  })
  const monitorTaskService = createMonitorTaskService({ store: monitorTaskStore, scheduler: monitorScheduler })

  registerIpcHandlers({ authService, promotionPlanService, monitorTaskService })
  void createMainWindow(mainWindowOptions)

  // 窗口先打开，产品会话恢复在后台执行；恢复完成后再启动监控调度器。
  // 如果服务暂时不可用，Renderer 会给出明确重试入口，不再卡在 disabled query 的 pending 状态。
  try {
    await authService.restoreSession()
  } catch {
    console.warn('启动时暂时无法恢复产品会话，应用仍会显示登录页。')
  } finally {
    monitorScheduler.start()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow(mainWindowOptions)
  })
})

app.on('before-quit', () => monitorScheduler?.stop())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
