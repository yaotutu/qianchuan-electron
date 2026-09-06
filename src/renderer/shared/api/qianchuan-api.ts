import { ZodError } from 'zod'
import {
  authorizationSchema,
  healthSchema,
  promotionPlanResultSchema,
  monitorTaskListResultSchema,
  monitorTaskMutationResultSchema,
  monitorTaskRunResultSchema,
  type PromotionPlanFilters,
  type MonitorTaskFilters,
  type MonitorTaskCreateInput,
  type MonitorTaskUpdateInput,
} from '../../../shared/contracts'

/** 获取 preload 暴露的安全桥；Renderer 永远不直接访问 Node.js 或巨量接口。 */
const getBridge = () => {
  if (!window.qianchuan?.auth || !window.qianchuan?.promotionMonitor) {
    throw new Error('客户端安全接口初始化失败，请重启应用。')
  }
  return window.qianchuan
}

/**
 * 开发态下 Renderer 会由 Vite 即时刷新，而 Electron 主进程与 preload 需要完整重启。
 * 将常见的 IPC 版本不一致错误转换成用户能执行的中文提示，同时不把堆栈和本地路径展示到页面。
 */
export const normalizeClientRequestError = (error: unknown, actionName: string) => {
  if (error instanceof ZodError) {
    return new Error(`${actionName}返回的数据格式与当前客户端不兼容，请重启应用。`)
  }

  const message = error instanceof Error ? error.message : ''
  if (/no handler registered|ipc channel|object has been destroyed|render frame was disposed/i.test(message)) {
    return new Error(`${actionName}失败：客户端主进程尚未同步，请重启应用。`)
  }
  return error instanceof Error ? error : new Error(`${actionName}失败，请稍后重试。`)
}

/** 所有桥接调用统一收口错误转换，避免每个页面重复判断 Electron IPC 异常。 */
const runBridgeRequest = async <T>(actionName: string, request: () => Promise<T>) => {
  try {
    return await request()
  } catch (error) {
    throw normalizeClientRequestError(error, actionName)
  }
}

export const qianchuanApi = {
  getHealth: () =>
    runBridgeRequest('读取登录服务状态', async () => healthSchema.parse(await getBridge().auth.getHealth())),
  getCurrentAuthorization: () =>
    runBridgeRequest('读取登录状态', async () => authorizationSchema.parse(await getBridge().auth.getCurrent())),
  startLogin: () =>
    runBridgeRequest('发起登录', async () => authorizationSchema.parse(await getBridge().auth.startLogin())),
  getLoginStatus: () =>
    runBridgeRequest('读取授权结果', async () => authorizationSchema.parse(await getBridge().auth.getLoginStatus())),
  listPromotionPlans: (filters: PromotionPlanFilters) =>
    runBridgeRequest('读取商品投放计划', async () =>
      promotionPlanResultSchema.parse(await getBridge().promotionMonitor.listPlans(filters)),
    ),
  listMonitorTasks: (filters: MonitorTaskFilters) =>
    runBridgeRequest('读取本地监控任务', async () =>
      monitorTaskListResultSchema.parse(await getBridge().promotionMonitor.listTasks(filters)),
    ),
  createMonitorTasks: (input: MonitorTaskCreateInput) =>
    runBridgeRequest('创建监控任务', async () =>
      monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.createTask(input)),
    ),
  updateMonitorTask: (taskId: string, input: MonitorTaskUpdateInput) =>
    runBridgeRequest('更新监控任务', async () =>
      monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.updateTask(taskId, input)),
    ),
  deleteMonitorTask: (taskId: string) =>
    runBridgeRequest('删除监控任务', async () =>
      monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.deleteTask(taskId)),
    ),
  batchUpdateMonitorTaskStatus: (taskIds: string[], status: 'RUNNING' | 'PAUSED') =>
    runBridgeRequest('批量更新监控任务', async () =>
      monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.batchUpdateStatus(taskIds, status)),
    ),
  batchDeleteMonitorTasks: (taskIds: string[]) =>
    runBridgeRequest('批量删除监控任务', async () =>
      monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.batchDelete(taskIds)),
    ),
  runMonitorTasksNow: (advertiserId: string) =>
    runBridgeRequest('立即检查监控任务', async () =>
      monitorTaskRunResultSchema.parse(await getBridge().promotionMonitor.runNow(advertiserId)),
    ),
  onMonitorTasksChanged: (listener: () => void) => getBridge().promotionMonitor.onChanged(listener),
}
