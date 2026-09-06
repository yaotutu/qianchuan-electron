import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from './shared/contracts/ipc'
import type {
  MonitorTaskCreateInput,
  MonitorTaskFilters,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from './shared/contracts/monitor-task'
import type { PromotionPlanDetailInput, PromotionPlanFilters } from './shared/contracts/promotion-plan'

/**
 * preload 是 Renderer 和主进程之间唯一的安全边界。
 * 这里只暴露按业务划分的最小 API，页面无法直接取得 ipcRenderer、shell 或 Node.js 能力。
 */
const authBridge = {
  startLogin: () => ipcRenderer.invoke(IPC_CHANNELS.auth.startLogin),
  getLoginStatus: () => ipcRenderer.invoke(IPC_CHANNELS.auth.getStatus),
  getCurrent: () => ipcRenderer.invoke(IPC_CHANNELS.auth.getCurrent),
  getHealth: () => ipcRenderer.invoke(IPC_CHANNELS.auth.getHealth),
}

const promotionMonitorBridge = {
  listPlans: (filters: PromotionPlanFilters) => ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.list, filters),
  getPlanDetail: (input: PromotionPlanDetailInput) => ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.detail, input),
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
