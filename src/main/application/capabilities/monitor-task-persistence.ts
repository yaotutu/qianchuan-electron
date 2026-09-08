import type { MonitorTask } from '../../../shared/contracts/monitor-task'

/**
 * 监控任务持久化能力。
 *
 * 这是一个函数记录，而不是 Repository 类或继承体系。应用层只知道如何读取和
 * 替换完整任务集合，不知道底层是 JSON、SQLite 还是其他本地存储。
 */
export type MonitorTaskPersistence = {
  readAll: () => Promise<MonitorTask[]>
  replaceAll: (tasks: MonitorTask[]) => Promise<void>
}
