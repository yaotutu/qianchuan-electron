import type {
  MonitorTaskCreateInput,
  MonitorTaskStoreFilters,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from '../../shared/contracts/monitor-task'
import type { MonitorScheduler } from '../monitor-scheduler'
import type { MonitorTaskStore } from '../monitor-task-store'

type MonitorTaskServiceStore = Pick<MonitorTaskStore, 'list' | 'create' | 'update' | 'removeMany' | 'setManyStatus'>
type MonitorTaskRunner = Pick<MonitorScheduler, 'runOnce'>

/** 监控任务应用服务只编排本地仓库和调度器，不把业务 CRUD 下沉到 OAuth 服务端。 */
export const createMonitorTaskService = (store: MonitorTaskServiceStore, scheduler: MonitorTaskRunner) => ({
  list: async (filters: MonitorTaskStoreFilters) => ({
    ok: true,
    status: 'ready',
    ...(await store.list(filters || {})),
  }),
  create: async (input: MonitorTaskCreateInput) => ({
    ok: true,
    status: 'created',
    tasks: await store.create(input),
  }),
  update: async (taskId: string, input: MonitorTaskUpdateInput) => ({
    ok: true,
    status: 'updated',
    task: await store.update(taskId, input),
  }),
  delete: async (taskId: string) => ({
    ok: true,
    status: 'deleted',
    deletedIds: await store.removeMany([taskId]),
  }),
  batchUpdateStatus: async (taskIds: string[], status: MonitorTaskStatus) => ({
    ok: true,
    status: 'updated',
    tasks: await store.setManyStatus(taskIds, status),
  }),
  batchDelete: async (taskIds: string[]) => ({
    ok: true,
    status: 'deleted',
    deletedIds: await store.removeMany(taskIds),
  }),
  runNow: async (advertiserId: string) => {
    const result = await scheduler.runOnce({ force: true, advertiserId: String(advertiserId || '').trim() })
    return { ok: true, status: result.skipped ? 'busy' : 'checked', ...result }
  },
})

export type MonitorTaskService = ReturnType<typeof createMonitorTaskService>
