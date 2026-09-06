import type { MonitorTask } from '../../../shared/contracts/monitor-task'

/**
 * 监控任务持久化端口。
 * application/domain 只依赖这一最小接口，不关心底层是 JSON、SQLite 还是其他本地存储。
 */
export type MonitorTaskRepository = {
  readAll: () => Promise<MonitorTask[]>
  replaceAll: (tasks: MonitorTask[]) => Promise<void>
}
