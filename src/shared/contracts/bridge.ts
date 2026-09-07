import type {
  MonitorTaskCreateInput,
  MonitorTaskFilters,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from './monitor-task'
import type { PromotionPlanDetailInput, PromotionPlanFilters } from './promotion-plan'
import type { PromotionPlanWriteInput } from './promotion-plan-write'

/** Renderer 可见的全部能力清单；不暴露 ipcRenderer、shell 或任何 Node.js API。 */
export type QianchuanBridge = {
  auth: {
    startLogin: () => Promise<unknown>
    getLoginStatus: () => Promise<unknown>
    getCurrent: () => Promise<unknown>
    getHealth: () => Promise<unknown>
  }
  promotionMonitor: {
    listPlans: (filters: PromotionPlanFilters) => Promise<unknown>
    getPlanDetail: (input: PromotionPlanDetailInput) => Promise<unknown>
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
