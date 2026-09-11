import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from './shared/contracts/ipc'
import type {
  MonitorTaskCreateInput,
  MonitorTaskFilters,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from './shared/contracts/monitor-task'
import type {
  PromotionPlanDetailInput,
  PromotionPlanDetailResult,
  PromotionPlanListInput,
  PromotionPlanMonitorSelectionInput,
  PromotionPlanListResult,
} from './shared/contracts/promotion-plan'
import type { PromotionPlanWriteInput } from './shared/contracts/promotion-plan-write'
import type { ProductCredentials, ProductRegisterInput } from './shared/contracts/auth'

/**
 * preload 是 Renderer 和主进程之间唯一的安全边界。
 * 这里只暴露按业务划分的最小 API，页面无法直接取得 ipcRenderer、shell 或 Node.js 能力。
 */
const authBridge = {
  getHealth: () => ipcRenderer.invoke(IPC_CHANNELS.auth.getHealth),
  restoreSession: () => ipcRenderer.invoke(IPC_CHANNELS.auth.restoreSession),
  register: (input: ProductRegisterInput) => ipcRenderer.invoke(IPC_CHANNELS.auth.register, input),
  login: (input: ProductCredentials) => ipcRenderer.invoke(IPC_CHANNELS.auth.login, input),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.auth.logout),
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.auth.getState),
  startLogin: () => ipcRenderer.invoke(IPC_CHANNELS.auth.startLogin),
  getLoginStatus: () => ipcRenderer.invoke(IPC_CHANNELS.auth.getStatus),
  selectAuthorization: (authorizationId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.auth.selectAuthorization, authorizationId),
  deleteAuthorization: (authorizationId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.auth.deleteAuthorization, authorizationId),
}

const promotionMonitorBridge = {
  listPlans: (input: PromotionPlanListInput): Promise<PromotionPlanListResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.list, input),
  findPlansForMonitor: (input: PromotionPlanMonitorSelectionInput): Promise<PromotionPlanListResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.findForMonitor, input),
  getPlanDetail: (input: PromotionPlanDetailInput): Promise<PromotionPlanDetailResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.detail, input),
  updatePlan: (input: PromotionPlanWriteInput) => ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.update, input),
  listTasks: (filters: MonitorTaskFilters) => ipcRenderer.invoke(IPC_CHANNELS.monitorTask.list, filters),
  createTask: (input: MonitorTaskCreateInput) => ipcRenderer.invoke(IPC_CHANNELS.monitorTask.create, input),
  updateTask: (taskId: string, input: MonitorTaskUpdateInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.update, taskId, input),
  deleteTask: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.monitorTask.delete, taskId),
  batchUpdateStatus: (taskIds: string[], status: MonitorTaskStatus) =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.batchStatus, taskIds, status),
  batchDelete: (taskIds: string[]) => ipcRenderer.invoke(IPC_CHANNELS.monitorTask.batchDelete, taskIds),
  runNow: (advertiserId: string) => ipcRenderer.invoke(IPC_CHANNELS.monitorTask.runNow, advertiserId),
  onChanged: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.monitorTask.changed, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.monitorTask.changed, handler)
  },
}

contextBridge.exposeInMainWorld('qianchuan', {
  auth: authBridge,
  promotionMonitor: promotionMonitorBridge,
})
