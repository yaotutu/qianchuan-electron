import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from './shared/contracts/ipc'
import type {
  MonitorTaskBatchUpdateResult,
  MonitorTaskCreateInput,
  MonitorTaskCreateResult,
  MonitorTaskDeleteResult,
  MonitorTaskFilters,
  MonitorTaskListResult,
  MonitorTaskRunResult,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
  MonitorTaskUpdateResult,
} from './shared/contracts/monitor-task'
import type {
  PromotionPlanDetailInput,
  PromotionPlanDetailResult,
  PromotionPlanListInput,
  PromotionPlanMonitorSelectionInput,
  PromotionPlanListResult,
} from './shared/contracts/promotion-plan'
import type { PromotionPlanWriteInput, PromotionPlanWriteResult } from './shared/contracts/promotion-plan-write'
import type {
  AuthActionResult,
  AuthStateResult,
  HealthResult,
  OAuthLoginStatusResult,
  ProductCredentials,
  ProductRegisterInput,
} from './shared/contracts/auth'
import type { AppUpdateResult, AppUpdateState } from './shared/contracts/app-update'

/**
 * preload 是 Renderer 和主进程之间唯一的安全边界。
 * 这里只暴露按业务划分的最小 API，页面无法直接取得 ipcRenderer、shell 或 Node.js 能力。
 */
const authBridge = {
  getHealth: (): Promise<HealthResult> => ipcRenderer.invoke(IPC_CHANNELS.auth.getHealth),
  restoreSession: (): Promise<AuthStateResult> => ipcRenderer.invoke(IPC_CHANNELS.auth.restoreSession),
  register: (input: ProductRegisterInput): Promise<AuthActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.auth.register, input),
  login: (input: ProductCredentials): Promise<AuthActionResult> => ipcRenderer.invoke(IPC_CHANNELS.auth.login, input),
  logout: (): Promise<AuthActionResult> => ipcRenderer.invoke(IPC_CHANNELS.auth.logout),
  getState: (): Promise<AuthStateResult> => ipcRenderer.invoke(IPC_CHANNELS.auth.getState),
  startLogin: (): Promise<AuthActionResult> => ipcRenderer.invoke(IPC_CHANNELS.auth.startLogin),
  getLoginStatus: (): Promise<OAuthLoginStatusResult> => ipcRenderer.invoke(IPC_CHANNELS.auth.getStatus),
  selectAuthorization: (authorizationId: string): Promise<AuthStateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.auth.selectAuthorization, authorizationId),
  deleteAuthorization: (authorizationId: string): Promise<AuthActionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.auth.deleteAuthorization, authorizationId),
}

const appUpdateBridge = {
  getState: (): Promise<AppUpdateResult> => ipcRenderer.invoke(IPC_CHANNELS.appUpdate.getState),
  check: (): Promise<AppUpdateResult> => ipcRenderer.invoke(IPC_CHANNELS.appUpdate.check),
  install: (): Promise<AppUpdateResult> => ipcRenderer.invoke(IPC_CHANNELS.appUpdate.install),
  onChanged: (listener: (state: AppUpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppUpdateState) => listener(state)
    ipcRenderer.on(IPC_CHANNELS.appUpdate.changed, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appUpdate.changed, handler)
  },
}

const promotionMonitorBridge = {
  listPlans: (input: PromotionPlanListInput): Promise<PromotionPlanListResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.list, input),
  findPlansForMonitor: (input: PromotionPlanMonitorSelectionInput): Promise<PromotionPlanListResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.findForMonitor, input),
  getPlanDetail: (input: PromotionPlanDetailInput): Promise<PromotionPlanDetailResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.detail, input),
  updatePlan: (input: PromotionPlanWriteInput): Promise<PromotionPlanWriteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.promotionPlan.update, input),
  listTasks: (filters: MonitorTaskFilters): Promise<MonitorTaskListResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.list, filters),
  createTask: (input: MonitorTaskCreateInput): Promise<MonitorTaskCreateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.create, input),
  updateTask: (taskId: string, input: MonitorTaskUpdateInput): Promise<MonitorTaskUpdateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.update, taskId, input),
  deleteTask: (taskId: string): Promise<MonitorTaskDeleteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.delete, taskId),
  batchUpdateStatus: (taskIds: string[], status: MonitorTaskStatus): Promise<MonitorTaskBatchUpdateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.batchStatus, taskIds, status),
  batchDelete: (taskIds: string[]): Promise<MonitorTaskDeleteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.batchDelete, taskIds),
  runNow: (advertiserId: string): Promise<MonitorTaskRunResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.monitorTask.runNow, advertiserId),
  onChanged: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on(IPC_CHANNELS.monitorTask.changed, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.monitorTask.changed, handler)
  },
}

contextBridge.exposeInMainWorld('qianchuan', {
  auth: authBridge,
  appUpdate: appUpdateBridge,
  promotionMonitor: promotionMonitorBridge,
})
