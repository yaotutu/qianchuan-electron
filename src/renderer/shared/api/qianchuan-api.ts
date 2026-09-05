import {
  authorizationSchema,
  healthSchema,
  promotionPlanResultSchema,
  monitorTaskListResultSchema,
  monitorTaskMutationResultSchema,
  type PromotionPlanFilters,
  type MonitorTaskFilters,
  type MonitorTaskInput,
  type MonitorTaskUpdateInput,
} from '../model/qianchuan'

/** 获取 preload 暴露的安全桥；Renderer 永远不直接访问 Node.js 或巨量接口。 */
const getBridge = () => {
  if (!window.qianchuan?.auth || !window.qianchuan?.promotionMonitor) {
    throw new Error('客户端安全接口初始化失败，请重启应用。')
  }
  return window.qianchuan
}

export const qianchuanApi = {
  getHealth: async () => healthSchema.parse(await getBridge().auth.getHealth()),
  getCurrentAuthorization: async () => authorizationSchema.parse(await getBridge().auth.getCurrent()),
  startLogin: async () => authorizationSchema.parse(await getBridge().auth.startLogin()),
  getLoginStatus: async () => authorizationSchema.parse(await getBridge().auth.getLoginStatus()),
  listPromotionPlans: async (filters: PromotionPlanFilters) =>
    promotionPlanResultSchema.parse(await getBridge().promotionMonitor.listPlans(filters)),
  listMonitorTasks: async (filters: MonitorTaskFilters) =>
    monitorTaskListResultSchema.parse(await getBridge().promotionMonitor.listTasks(filters)),
  createMonitorTasks: async (input: MonitorTaskInput) =>
    monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.createTask(input)),
  updateMonitorTask: async (taskId: string, input: MonitorTaskUpdateInput) =>
    monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.updateTask(taskId, input)),
  deleteMonitorTask: async (taskId: string) =>
    monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.deleteTask(taskId)),
  batchUpdateMonitorTaskStatus: async (taskIds: string[], status: 'RUNNING' | 'PAUSED') =>
    monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.batchUpdateStatus(taskIds, status)),
  batchDeleteMonitorTasks: async (taskIds: string[]) =>
    monitorTaskMutationResultSchema.parse(await getBridge().promotionMonitor.batchDelete(taskIds)),
}
