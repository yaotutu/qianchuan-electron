import type {
  AuthActionResult,
  AuthStateResult,
  HealthResult,
  ProductCredentials,
  ProductRegisterInput,
  OAuthLoginStatusResult,
} from './auth'
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
} from './monitor-task'
import type {
  PromotionPlanDetailInput,
  PromotionPlanDetailResult,
  PromotionPlanListInput,
  PromotionPlanMonitorSelectionInput,
  PromotionPlanListResult,
} from './promotion-plan'
import type { PromotionPlanWriteInput, PromotionPlanWriteResult } from './promotion-plan-write'
import type { AppUpdateResult, AppUpdateState } from './app-update'

/** Renderer 只能看到脱敏后的认证状态，所有产品/巨量 Token 都留在主进程。 */
export type QianchuanBridge = {
  auth: {
    getHealth: () => Promise<HealthResult>
    restoreSession: () => Promise<AuthStateResult>
    register: (input: ProductRegisterInput) => Promise<AuthActionResult>
    login: (input: ProductCredentials) => Promise<AuthActionResult>
    logout: () => Promise<AuthActionResult>
    getState: () => Promise<AuthStateResult>
    startLogin: () => Promise<AuthActionResult>
    getLoginStatus: () => Promise<OAuthLoginStatusResult>
    selectAuthorization: (authorizationId: string) => Promise<AuthStateResult>
    deleteAuthorization: (authorizationId: string) => Promise<AuthActionResult>
  }
  appUpdate: {
    getState: () => Promise<AppUpdateResult>
    check: () => Promise<AppUpdateResult>
    install: () => Promise<AppUpdateResult>
    onChanged: (listener: (state: AppUpdateState) => void) => () => void
  }
  promotionMonitor: {
    listPlans: (input: PromotionPlanListInput) => Promise<PromotionPlanListResult>
    findPlansForMonitor: (input: PromotionPlanMonitorSelectionInput) => Promise<PromotionPlanListResult>
    getPlanDetail: (input: PromotionPlanDetailInput) => Promise<PromotionPlanDetailResult>
    updatePlan: (input: PromotionPlanWriteInput) => Promise<PromotionPlanWriteResult>
    listTasks: (filters: MonitorTaskFilters) => Promise<MonitorTaskListResult>
    createTask: (input: MonitorTaskCreateInput) => Promise<MonitorTaskCreateResult>
    updateTask: (taskId: string, input: MonitorTaskUpdateInput) => Promise<MonitorTaskUpdateResult>
    deleteTask: (taskId: string) => Promise<MonitorTaskDeleteResult>
    batchUpdateStatus: (taskIds: string[], status: MonitorTaskStatus) => Promise<MonitorTaskBatchUpdateResult>
    batchDelete: (taskIds: string[]) => Promise<MonitorTaskDeleteResult>
    runNow: (advertiserId: string) => Promise<MonitorTaskRunResult>
    onChanged: (listener: () => void) => () => void
  }
}
