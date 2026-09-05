import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import {
  createMonitorTaskStore,
  type MonitorTaskCreateInput,
  type MonitorTaskFilters,
  type MonitorTaskStatus,
  type MonitorTaskUpdateInput,
} from './main/monitor-task-store'

type JsonRecord = Record<string, unknown>
type RequestError = Error & { status?: number; payload?: JsonRecord }
type PlanFilters = Record<string, unknown>

/**
 * OAuth 服务端地址只放在 Electron 主进程中读取。
 * 开发阶段默认使用本机 3100 端口；如果服务端部署在公网，可通过环境变量覆盖。
 */
const oauthServerUrl = (process.env.QIANCHUAN_OAUTH_SERVER_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '')
const requestTimeoutMs = 20_000
const rendererUrl = process.env.QIANCHUAN_RENDERER_URL
let monitorTaskStore: ReturnType<typeof createMonitorTaskStore> | null = null

/** 本地任务仓库只在 Electron ready 后按需初始化，文件位于当前用户的 userData 目录。 */
const getMonitorTaskStore = () => {
  if (!monitorTaskStore) {
    monitorTaskStore = createMonitorTaskStore(path.join(app.getPath('userData'), 'monitor-tasks.json'))
  }
  return monitorTaskStore
}
let activeAttemptId: string | null = null
let activeLoginStartedAt: string | null = null

const getErrorDetails = (error: unknown): RequestError =>
  error instanceof Error ? (error as RequestError) : (new Error('未知错误') as RequestError)

/** 统一请求 OAuth 服务端 JSON，Renderer 永远不直接访问平台接口。 */
const requestOAuthServer = async (pathname: string): Promise<JsonRecord> => {
  let response: Response
  try {
    response = await fetch(`${oauthServerUrl}${pathname}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch (error) {
    throw new Error(`无法连接 OAuth 服务端（${oauthServerUrl}）。请先启动 qianchuan-oauth-callback。`, { cause: error })
  }

  let payload: JsonRecord
  try {
    payload = (await response.json()) as JsonRecord
  } catch (error) {
    throw new Error('OAuth 服务端返回了无法解析的数据。', { cause: error })
  }

  if (!response.ok) {
    const message =
      typeof payload.message === 'string' ? payload.message : `OAuth 服务端请求失败（HTTP ${response.status}）`
    const requestError = new Error(message) as RequestError
    requestError.status = response.status
    requestError.payload = payload
    throw requestError
  }
  return payload
}

/** 发起登录：主进程拿到授权地址后调用系统浏览器打开。 */
const startOAuthLogin = async () => {
  const result = await requestOAuthServer('/oauth/oceanengine/start?format=json')
  if (result.ok !== true || typeof result.authorizationUrl !== 'string' || typeof result.attemptId !== 'string') {
    return {
      ok: false,
      status: 'server_unavailable',
      message: '登录服务暂未准备好，请稍后重试。',
    }
  }
  activeAttemptId = result.attemptId
  activeLoginStartedAt = typeof result.startedAt === 'string' ? result.startedAt : new Date().toISOString()
  await shell.openExternal(result.authorizationUrl)
  return {
    ok: true,
    status: 'waiting',
    startedAt: activeLoginStartedAt,
    expiresInSeconds: result.expiresInSeconds,
    message: '已打开巨量授权页面，请在浏览器中完成授权。',
  }
}

/** 查询服务端最近一次授权结果；一次性尝试结束后立即清理本地状态。 */
const getOAuthStatus = async () => {
  if (!activeAttemptId) return { ok: true, status: 'idle', message: '还没有发起本次授权。' }
  try {
    const result = await requestOAuthServer(`/oauth/result?attempt_id=${encodeURIComponent(activeAttemptId)}`)
    if (result.status !== 'waiting') {
      activeAttemptId = null
      activeLoginStartedAt = null
    }
    return result
  } catch (error) {
    if (getErrorDetails(error).status === 404) {
      activeAttemptId = null
      activeLoginStartedAt = null
      return {
        ok: false,
        status: 'expired',
        message: '本次登录请求已经失效，请重新登录。',
      }
    }
    throw error
  }
}

/** 恢复服务端最近一次持久化授权。 */
const getCurrentAuthorization = async () => {
  try {
    return await requestOAuthServer('/oauth/current')
  } catch (error) {
    const details = getErrorDetails(error)
    if (details.status === 404) return { ok: true, status: 'idle', message: '当前还没有完成授权。' }
    if (details.status === 401) {
      const requiresLogin = details.payload?.status === 'reauthorization_required'
      return {
        ok: false,
        status: requiresLogin ? 'reauthorization_required' : 'token_refresh_failed',
        message: requiresLogin ? '授权已失效，请重新登录。' : '登录服务暂时无法续期授权，请稍后重新检测。',
      }
    }
    throw error
  }
}

const getOAuthHealth = async () => {
  const health = await requestOAuthServer('/health')
  const capabilities = Array.isArray(health.capabilities) ? health.capabilities : []
  const requiredCapabilities = ['oauth-attempt-result', 'current-authorization', 'product-plan-list']
  if (typeof health.version !== 'string' || requiredCapabilities.some((name) => !capabilities.includes(name))) {
    return {
      ok: false,
      status: 'server_outdated',
      message: '登录服务仍在运行旧版本，请重启登录服务后再试。',
    }
  }
  if (health.configured !== true) {
    console.error('OAuth 服务端配置未完成：', health.missingConfig || [])
    return {
      ok: false,
      status: 'server_unavailable',
      message: '登录服务暂未准备好，请稍后重试。',
    }
  }
  return { ok: true, status: 'ready', version: health.version }
}

/** 只把允许的计划筛选项转发给自有服务端，阻断 Renderer 传入任意参数。 */
const createProductPlanSearch = (filters: PlanFilters = {}) => {
  const params = new URLSearchParams()
  const allowedKeys = ['advertiser_id', 'keyword', 'status', 'scene', 'start_date', 'end_date', 'page', 'page_size']
  allowedKeys.forEach((key) => {
    const value = filters[key]
    if (['string', 'number'].includes(typeof value) && String(value).trim()) params.set(key, String(value).trim())
  })
  return params
}

const getProductPlans = async (filters: PlanFilters) =>
  requestOAuthServer(`/api/qianchuan/product-plans?${createProductPlanSearch(filters).toString()}`)

/** 监控任务全部保存在 Electron 本地，服务端只负责 OAuth 和千川只读计划代理。 */
const getMonitorTasks = async (filters: MonitorTaskFilters) => {
  const result = await getMonitorTaskStore().list(filters)
  return { ok: true, status: 'ready', ...result }
}

const createMonitorTasks = async (input: MonitorTaskCreateInput) => {
  const tasks = await getMonitorTaskStore().create(input)
  return { ok: true, status: 'created', tasks }
}

const updateMonitorTask = async (taskId: string, input: MonitorTaskUpdateInput) => {
  const task = await getMonitorTaskStore().update(taskId, input)
  return { ok: true, status: 'updated', task }
}

const deleteMonitorTask = async (taskId: string) => {
  const deletedIds = await getMonitorTaskStore().removeMany([taskId])
  return { ok: true, status: 'deleted', deletedIds }
}

const batchUpdateMonitorTaskStatus = async (taskIds: string[], status: string) => {
  const tasks = await getMonitorTaskStore().setManyStatus(taskIds, status as MonitorTaskStatus)
  return { ok: true, status: 'updated', tasks }
}

const batchDeleteMonitorTasks = async (taskIds: string[]) => {
  const deletedIds = await getMonitorTaskStore().removeMany(taskIds)
  return { ok: true, status: 'deleted', deletedIds }
}

/** 将异常转换成不包含 Token、Secret、Cookie 和本地路径的 IPC 响应。 */
const toSafeError = (error: unknown) => {
  const details = getErrorDetails(error)
  if (details.status === 503)
    return {
      ok: false,
      status: 'server_unavailable',
      message: '登录服务暂未准备好，请稍后重试。',
    }
  if (details.payload && [400, 401, 403, 502].includes(details.status || 0)) {
    return {
      ok: false,
      status: typeof details.payload.status === 'string' ? details.payload.status : 'error',
      message: typeof details.payload.message === 'string' ? details.payload.message : '服务端请求失败。',
      platformCode: details.payload.platformCode ?? null,
    }
  }
  return {
    ok: false,
    status: 'error',
    message: details.message || '请求服务端时发生未知错误。',
  }
}

const registerIpcHandlers = () => {
  ipcMain.handle('oauth:start-login', async () => {
    try {
      return await startOAuthLogin()
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('oauth:get-status', async () => {
    try {
      return await getOAuthStatus()
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('oauth:get-current', async () => {
    try {
      return await getCurrentAuthorization()
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('oauth:get-health', async () => {
    try {
      return await getOAuthHealth()
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('plans:list', async (_event, filters: PlanFilters) => {
    try {
      return await getProductPlans(filters)
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('monitor-tasks:list', async (_event, filters: MonitorTaskFilters) => {
    try {
      return await getMonitorTasks(filters || {})
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('monitor-tasks:create', async (_event, input: MonitorTaskCreateInput) => {
    try {
      return await createMonitorTasks(input)
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('monitor-tasks:update', async (_event, taskId: string, input: MonitorTaskUpdateInput) => {
    try {
      return await updateMonitorTask(taskId, input)
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('monitor-tasks:delete', async (_event, taskId: string) => {
    try {
      return await deleteMonitorTask(taskId)
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('monitor-tasks:batch-status', async (_event, taskIds: string[], status: MonitorTaskStatus) => {
    try {
      return await batchUpdateMonitorTaskStatus(taskIds, status)
    } catch (error) {
      return toSafeError(error)
    }
  })
  ipcMain.handle('monitor-tasks:batch-delete', async (_event, taskIds: string[]) => {
    try {
      return await batchDeleteMonitorTasks(taskIds)
    } catch (error) {
      return toSafeError(error)
    }
  })
}

/** 创建应用主窗口，生产环境加载 Vite 产物，主进程本身不加载远程页面。 */
const createWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1120,
    minHeight: 640,
    backgroundColor: '#f5f6f9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  void createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
