import type {
  MonitorTaskCreateInput,
  MonitorTaskStoreFilters,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from '../../shared/contracts/monitor-task'
import type { MonitorTaskServiceDependencies } from './capabilities/monitor-task'

/**
 * 监控任务应用服务只编排显式传入的能力函数，不依赖 Store、Scheduler 的具体实现。
 *
 * 这样做的重点不是增加抽象层，而是把“应用用例需要什么”直接写成数据记录，
 * 由主进程组合根负责把真实能力接上。测试时也可以直接传入普通函数。
 */
export const createMonitorTaskService = ({ store, scheduler }: MonitorTaskServiceDependencies) => ({
  list: async (filters: MonitorTaskStoreFilters) => ({
    ok: true as const,
    status: 'ready' as const,
    ...(await store.list(filters || {})),
  }),
  create: async (input: MonitorTaskCreateInput) => ({
    ok: true as const,
    status: 'created' as const,
    tasks: await store.create(input),
  }),
  update: async (taskId: string, input: MonitorTaskUpdateInput) => ({
    ok: true as const,
    status: 'updated' as const,
    task: await store.update(taskId, input),
  }),
  delete: async (taskId: string) => ({
    ok: true as const,
    status: 'deleted' as const,
    deletedIds: await store.removeMany([taskId]),
  }),
  batchUpdateStatus: async (taskIds: string[], status: MonitorTaskStatus) => ({
    ok: true as const,
    status: 'updated' as const,
    tasks: await store.setManyStatus(taskIds, status),
  }),
  batchDelete: async (taskIds: string[]) => ({
    ok: true as const,
    status: 'deleted' as const,
    deletedIds: await store.removeMany(taskIds),
  }),
  runNow: async (advertiserId: string) => {
    const result = await scheduler.runOnce({
      force: true,
      advertiserId: String(advertiserId || '').trim(),
    })
    return { ok: true as const, status: result.skipped ? ('busy' as const) : ('checked' as const), ...result }
  },
})

export type MonitorTaskService = ReturnType<typeof createMonitorTaskService>
