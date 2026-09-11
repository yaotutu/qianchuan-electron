import type {
  MonitorTask,
  MonitorTaskCreateInput,
  MonitorTaskListData,
  MonitorTaskStoreFilters,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from '../../../shared/contracts/monitor-task'

/**
 * 监控任务 Store 对应用层提供的最小能力集合。
 *
 * 这里故意只描述“需要什么函数”，不引用 Store 的具体创建函数或返回对象类型。
 * 这样应用用例可以接收真实 Store、测试替身或未来的其他实现，而不需要修改自身代码。
 */
export type MonitorTaskStoreCapabilities = {
  list: (filters: MonitorTaskStoreFilters) => Promise<MonitorTaskListData>
  create: (input: MonitorTaskCreateInput) => Promise<MonitorTask[]>
  update: (taskId: string, input: MonitorTaskUpdateInput) => Promise<MonitorTask>
  removeMany: (taskIds: string[]) => Promise<string[]>
  setManyStatus: (taskIds: string[], status: MonitorTaskStatus) => Promise<MonitorTask[]>
}

/** 手动检查和定时检查共用的最小调度能力。 */
export type MonitorTaskSchedulerCapabilities = {
  runOnce: (options?: MonitorTaskRunOptions) => Promise<MonitorTaskRunSummary>
}

/** 调度器返回给应用层的纯数据摘要，不暴露内部锁或定时器状态。 */
export type MonitorTaskRunOptions = {
  force?: boolean
  advertiserId?: string
}

export type MonitorTaskRunSummary = {
  outcome: 'checked' | 'busy' | 'idle'
  checkedCount: number
  triggeredCount: number
  normalCount: number
  errorCount: number
  dataMissingCount: number
}

/** 监控任务应用用例的全部外部能力，由组合根显式传入。 */
export type MonitorTaskServiceDependencies = {
  store: MonitorTaskStoreCapabilities
  scheduler: MonitorTaskSchedulerCapabilities
}
