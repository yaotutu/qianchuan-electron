import { randomUUID } from 'node:crypto'
import type { MonitorTaskRepository } from './application/ports/monitor-task-repository'

import type {
  MonitorMetric,
  MonitorOperator,
  MonitorRule,
  MonitorTask,
  MonitorTaskCheckResult,
  MonitorTaskCreateInput,
  MonitorTaskStoreFilters,
  MonitorTaskListResult,
  MonitorTaskStatus,
  MonitorTaskUpdateInput,
} from '../shared/contracts/monitor-task'

type StoreDependencies = {
  now?: () => Date
  createId?: () => string
}

const METRICS = new Set<MonitorMetric>(['ROI', 'COST', 'BUDGET'])
const OPERATORS = new Set<MonitorOperator>(['GT', 'GTE', 'LT', 'LTE'])
const STATUSES = new Set<MonitorTaskStatus>(['RUNNING', 'PAUSED'])
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/** 业务校验错误会直接转换成可展示给用户的中文提示。 */
export class MonitorTaskValidationError extends Error {}

const asTrimmedText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const assertRule = (rule: MonitorRule | undefined): MonitorRule => {
  if (!rule || !METRICS.has(rule.metric)) throw new MonitorTaskValidationError('请选择有效的监控指标。')
  if (!OPERATORS.has(rule.operator)) throw new MonitorTaskValidationError('请选择有效的比较条件。')
  if (!Number.isFinite(rule.threshold) || rule.threshold < 0) {
    throw new MonitorTaskValidationError('监控阈值必须是大于或等于 0 的数字。')
  }
  return { metric: rule.metric, operator: rule.operator, threshold: rule.threshold }
}

const assertInterval = (value: number | undefined) => {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1_440) {
    throw new MonitorTaskValidationError('监控间隔必须是 1 到 1440 之间的整数分钟。')
  }
  return Number(value)
}

const assertStatus = (value: MonitorTaskStatus | undefined, fallback: MonitorTaskStatus) => {
  const status = value ?? fallback
  if (!STATUSES.has(status)) throw new MonitorTaskValidationError('监控任务状态无效。')
  return status
}

/**
 * 创建任务是一个纯转换：同一份计划快照和规则输入会生成结构一致的任务。
 * ID 与时间由外部注入，便于测试，也避免把文件读写耦合到业务校验中。
 */
export const createMonitorTasks = (input: MonitorTaskCreateInput, now: Date, createId: () => string): MonitorTask[] => {
  const advertiserId = asTrimmedText(input.advertiserId)
  if (!advertiserId) throw new MonitorTaskValidationError('请选择所属千川账号。')
  if (!Array.isArray(input.plans) || input.plans.length === 0) {
    throw new MonitorTaskValidationError('请至少选择一个商品投放计划。')
  }

  const rule = assertRule(input.rule)
  const intervalMinutes = assertInterval(input.intervalMinutes)
  const status = assertStatus(input.status, 'RUNNING')
  if (input.action !== undefined && input.action !== 'NOTICE') {
    throw new MonitorTaskValidationError('当前版本只支持通知和记录，不会操作真实千川计划。')
  }

  const timestamp = now.toISOString()
  const groupName = asTrimmedText(input.groupName)
  return input.plans.map((plan) => {
    const promotionPlanId = asTrimmedText(plan.id)
    if (!promotionPlanId) throw new MonitorTaskValidationError('所选计划缺少计划 ID。')

    return {
      id: createId(),
      advertiserId,
      promotionPlanId,
      promotionPlanName: asTrimmedText(plan.name) || `计划 ${promotionPlanId}`,
      productName: asTrimmedText(plan.productName),
      productImage: asTrimmedText(plan.productImage),
      platformStatus: asTrimmedText(plan.status),
      groupName,
      status,
      rule,
      action: 'NOTICE',
      intervalMinutes,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastCheckedAt: null,
      lastResult: { status: 'PENDING', message: '等待首次检查' },
    }
  })
}

/** 更新只允许修改产品自身的任务规则，不接受计划 ID、平台状态等快照字段。 */
export const updateMonitorTask = (task: MonitorTask, input: MonitorTaskUpdateInput, now: Date): MonitorTask => {
  if (input.action !== undefined && input.action !== 'NOTICE') {
    throw new MonitorTaskValidationError('当前版本只支持通知和记录，不会操作真实千川计划。')
  }

  return {
    ...task,
    ...(input.groupName === undefined ? {} : { groupName: asTrimmedText(input.groupName) }),
    ...(input.status === undefined ? {} : { status: assertStatus(input.status, task.status) }),
    ...(input.rule === undefined ? {} : { rule: assertRule(input.rule) }),
    ...(input.intervalMinutes === undefined ? {} : { intervalMinutes: assertInterval(input.intervalMinutes) }),
    action: 'NOTICE',
    updatedAt: now.toISOString(),
  }
}

const toPositiveInteger = (value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback
}

/** 筛选与分页保持为纯函数，后续迁移 SQLite 时页面协议不需要变化。 */
export const filterMonitorTasks = (
  tasks: MonitorTask[],
  filters: MonitorTaskStoreFilters = {},
): MonitorTaskListResult => {
  const keyword = asTrimmedText(filters.keyword).toLocaleLowerCase('zh-CN')
  const advertiserId = asTrimmedText(filters.advertiser_id)
  const status = filters.status ?? 'ALL'
  const metric = filters.metric ?? 'ALL'
  const action = filters.action ?? 'ALL'

  const filtered = tasks
    .filter((task) => !advertiserId || task.advertiserId === advertiserId)
    .filter((task) => status === 'ALL' || task.status === status)
    .filter((task) => metric === 'ALL' || task.rule.metric === metric)
    .filter((task) => action === 'ALL' || task.action === action)
    .filter((task) => {
      if (!keyword) return true
      return [task.promotionPlanName, task.promotionPlanId, task.productName, task.groupName]
        .join('\n')
        .toLocaleLowerCase('zh-CN')
        .includes(keyword)
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  const pageSize = toPositiveInteger(filters.page_size, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / pageSize)
  const requestedPage = toPositiveInteger(filters.page, 1)
  const current = Math.min(requestedPage, Math.max(totalPages, 1))
  const start = (current - 1) * pageSize

  return {
    tasks: filtered.slice(start, start + pageSize),
    page: { current, pageSize, total: filtered.length, totalPages },
  }
}

/**
 * 监控任务 Store 承担本地业务规则和读改写串行化。
 * 它只依赖持久化端口，因此未来切换 SQLite 时无需改动 IPC、应用服务或调度器。
 */
export const createMonitorTaskStore = (repository: MonitorTaskRepository, dependencies: StoreDependencies = {}) => {
  const now = dependencies.now ?? (() => new Date())
  const createId = dependencies.createId ?? randomUUID
  let mutationQueue: Promise<unknown> = Promise.resolve()

  const readAll = () => repository.readAll()

  /** 串行化所有读改写操作，避免两个 IPC 同时提交时互相覆盖。 */
  const mutate = <T>(operation: (tasks: MonitorTask[]) => Promise<{ tasks: MonitorTask[]; result: T }>) => {
    const pending = mutationQueue.then(async () => {
      const current = await readAll()
      const next = await operation(current)
      await repository.replaceAll(next.tasks)
      return next.result
    })
    mutationQueue = pending.catch(() => undefined)
    return pending
  }

  return {
    list: async (filters: MonitorTaskStoreFilters) => filterMonitorTasks(await readAll(), filters),
    create: (input: MonitorTaskCreateInput) =>
      mutate(async (tasks) => {
        const created = createMonitorTasks(input, now(), createId)
        return { tasks: [...tasks, ...created], result: created }
      }),
    update: (taskId: string, input: MonitorTaskUpdateInput) =>
      mutate(async (tasks) => {
        const current = tasks.find((task) => task.id === taskId)
        if (!current) throw new MonitorTaskValidationError('监控任务不存在或已经删除。')
        const updated = updateMonitorTask(current, input, now())
        return {
          tasks: tasks.map((task) => (task.id === taskId ? updated : task)),
          result: updated,
        }
      }),
    removeMany: (taskIds: string[]) =>
      mutate(async (tasks) => {
        const ids = [...new Set(taskIds.filter((id) => typeof id === 'string' && id.trim()))]
        if (ids.length === 0) throw new MonitorTaskValidationError('请至少选择一个监控任务。')
        const idSet = new Set(ids)
        const deletedIds = tasks.filter((task) => idSet.has(task.id)).map((task) => task.id)
        return { tasks: tasks.filter((task) => !idSet.has(task.id)), result: deletedIds }
      }),
    recordCheck: (taskId: string, checkedAt: Date, result: MonitorTaskCheckResult) =>
      mutate(async (tasks) => {
        const current = tasks.find((task) => task.id === taskId)
        if (!current) throw new MonitorTaskValidationError('监控任务不存在或已经删除。')
        const checkedAtIso = checkedAt.toISOString()
        const updated = {
          ...current,
          lastCheckedAt: checkedAtIso,
          lastResult: result,
        }
        return {
          tasks: tasks.map((task) => (task.id === taskId ? updated : task)),
          result: updated,
        }
      }),
    listAll: async () => readAll(),
    setManyStatus: (taskIds: string[], status: MonitorTaskStatus) =>
      mutate(async (tasks) => {
        const nextStatus = assertStatus(status, 'PAUSED')
        const idSet = new Set(taskIds.filter((id) => typeof id === 'string' && id.trim()))
        if (idSet.size === 0) throw new MonitorTaskValidationError('请至少选择一个监控任务。')
        const timestamp = now().toISOString()
        const updated = tasks.map((task) =>
          idSet.has(task.id) ? { ...task, status: nextStatus, updatedAt: timestamp } : task,
        )
        return { tasks: updated, result: updated.filter((task) => idSet.has(task.id)) }
      }),
  }
}

export type MonitorTaskStore = ReturnType<typeof createMonitorTaskStore>
