import type {
  AuthActionResult,
  AuthState,
  HealthResult,
  ProductCredentials,
  ProductRegisterInput,
  OAuthLoginStatusResult,
} from './auth'
import type {
  MonitorTaskCreateInput,
  MonitorTaskFilters,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from './monitor-task'
import type {
  PromotionPlanDetailInput,
  PromotionPlanDetailResult,
  PromotionPlanListInput,
  PromotionPlanMonitorSelectionInput,
  PromotionPlanListResult,
} from './promotion-plan'
import type { PromotionPlanWriteInput } from './promotion-plan-write'
import type { AppUpdateState } from './app-update'

/** Renderer 只能看到脱敏后的认证状态，所有产品/巨量 Token 都留在主进程。 */
export type QianchuanBridge = {
  auth: {
    getHealth: () => Promise<HealthResult>
    restoreSession: () => Promise<AuthState>
    register: (input: ProductRegisterInput) => Promise<AuthActionResult>
    login: (input: ProductCredentials) => Promise<AuthActionResult>
    logout: () => Promise<AuthActionResult>
    getState: () => Promise<AuthState>
    startLogin: () => Promise<AuthActionResult>
    getLoginStatus: () => Promise<OAuthLoginStatusResult>
    selectAuthorization: (authorizationId: string) => Promise<AuthState>
    deleteAuthorization: (authorizationId: string) => Promise<AuthActionResult>
  }
  appUpdate: {
    getState: () => Promise<AppUpdateState>
    check: () => Promise<AppUpdateState>
    install: () => Promise<AppUpdateState>
    onChanged: (listener: (state: AppUpdateState) => void) => () => void
  }
  promotionMonitor: {
    listPlans: (input: PromotionPlanListInput) => Promise<PromotionPlanListResult>
    findPlansForMonitor: (input: PromotionPlanMonitorSelectionInput) => Promise<PromotionPlanListResult>
    getPlanDetail: (input: PromotionPlanDetailInput) => Promise<PromotionPlanDetailResult>
    updatePlan: (input: PromotionPlanWriteInput) => Promise<unknown>
    listTasks: (filters: MonitorTaskFilters) => Promise<unknown>
    createTask: (input: MonitorTaskCreateInput) => Promise<unknown>
    updateTask: (taskId: string, input: MonitorTaskUpdateInput) => Promise<unknown>
    deleteTask: (taskId: string) => Promise<unknown>
    batchUpdateStatus: (taskIds: string[], status: MonitorTaskStatus) => Promise<unknown>
    batchDelete: (taskIds: string[]) => Promise<unknown>
    runNow: (advertiserId: string) => Promise<unknown>
    onChanged: (listener: () => void) => () => void
  }
}
