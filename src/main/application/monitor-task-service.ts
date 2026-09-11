import type {
  MonitorTaskCreateData,
  MonitorTaskCreateInput,
  MonitorTaskDeleteData,
  MonitorTaskListData,
  MonitorTaskRunData,
  MonitorTaskStatus,
  MonitorTaskStoreFilters,
  MonitorTaskUpdateData,
  MonitorTaskUpdateInput,
  MonitorTaskBatchUpdateData,
} from '../../shared/contracts/monitor-task'
import { successResult, type Result } from '../../shared/contracts/result'
import type { MonitorTaskServiceDependencies } from './capabilities/monitor-task'

/**
 * 监控任务应用服务只编排显式传入的能力函数，不依赖 Store、Scheduler 的具体实现。
 *
 * Result<T> 在应用用例层形成稳定成功协议；参数错误、存储错误和调度异常由 IPC 边界
 * 统一转换为失败 Result，避免每个用例重复复制错误分类逻辑。
 */
export const createMonitorTaskService = ({ store, scheduler }: MonitorTaskServiceDependencies) => ({
  list: async (filters: MonitorTaskStoreFilters): Promise<Result<MonitorTaskListData>> =>
    successResult(await store.list(filters)),

  create: async (input: MonitorTaskCreateInput): Promise<Result<MonitorTaskCreateData>> =>
    successResult({ tasks: await store.create(input) }),

  update: async (taskId: string, input: MonitorTaskUpdateInput): Promise<Result<MonitorTaskUpdateData>> =>
    successResult({ task: await store.update(taskId, input) }),

  delete: async (taskId: string): Promise<Result<MonitorTaskDeleteData>> =>
    successResult({ deletedIds: await store.removeMany([taskId]) }),

  batchUpdateStatus: async (
    taskIds: string[],
    status: MonitorTaskStatus,
  ): Promise<Result<MonitorTaskBatchUpdateData>> =>
    successResult({ tasks: await store.setManyStatus(taskIds, status) }),

  batchDelete: async (taskIds: string[]): Promise<Result<MonitorTaskDeleteData>> =>
    successResult({ deletedIds: await store.removeMany(taskIds) }),

  runNow: async (advertiserId: string): Promise<Result<MonitorTaskRunData>> => {
    const result = await scheduler.runOnce({
      force: true,
      advertiserId: String(advertiserId || '').trim(),
    })
    return successResult(result)
  },
})

export type MonitorTaskService = ReturnType<typeof createMonitorTaskService>
