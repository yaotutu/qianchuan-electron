import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type MonitorMetric = 'ROI' | 'COST' | 'BUDGET'
export type MonitorOperator = 'GT' | 'GTE' | 'LT' | 'LTE'
export type MonitorTaskStatus = 'RUNNING' | 'PAUSED'
export type MonitorAction = 'NOTICE'

export type MonitorRule = {
  metric: MonitorMetric
  operator: MonitorOperator
  threshold: number
}

export type MonitorTask = {
  id: string
  advertiserId: string
  promotionPlanId: string
  promotionPlanName: string
  productName: string
  productImage: string
  platformStatus: string
  groupName: string
  status: MonitorTaskStatus
  rule: MonitorRule
  action: MonitorAction
  intervalMinutes: number
  createdAt: string
  updatedAt: string
  lastCheckedAt: string | null
  lastResult: {
    status: string
    message: string
  }
}

export type MonitorTaskCreateInput = {
  advertiserId?: string
  plans?: Array<{
    id?: string
    name?: string
    productName?: string
    productImage?: string
    status?: string
  }>
  groupName?: string
  status?: MonitorTaskStatus
  rule?: MonitorRule
  action?: MonitorAction
  intervalMinutes?: number
}

export type MonitorTaskUpdateInput = {
  groupName?: string
  status?: MonitorTaskStatus
  rule?: MonitorRule
  action?: MonitorAction
  intervalMinutes?: number
}

export type MonitorTaskFilters = {
  advertiser_id?: string
  keyword?: string
  status?: 'ALL' | MonitorTaskStatus
  metric?: 'ALL' | MonitorMetric
  action?: 'ALL' | MonitorAction
  page?: number
  page_size?: number
}

export type MonitorTaskListResult = {
  tasks: MonitorTask[]
  page: {
    current: number
    pageSize: number
    total: number
    totalPages: number
  }
}

type MonitorTaskFile = {
  version: 1
  tasks: MonitorTask[]
}

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
export const filterMonitorTasks = (tasks: MonitorTask[], filters: MonitorTaskFilters = {}): MonitorTaskListResult => {
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

const isMonitorTask = (value: unknown): value is MonitorTask => {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<MonitorTask>
  return (
    typeof task.id === 'string' &&
    typeof task.advertiserId === 'string' &&
    typeof task.promotionPlanId === 'string' &&
    typeof task.promotionPlanName === 'string' &&
    STATUSES.has(task.status as MonitorTaskStatus) &&
    task.action === 'NOTICE' &&
    Boolean(task.rule) &&
    METRICS.has(task.rule?.metric as MonitorMetric) &&
    OPERATORS.has(task.rule?.operator as MonitorOperator) &&
    typeof task.rule?.threshold === 'number' &&
    typeof task.intervalMinutes === 'number'
  )
}

const parseFile = (content: string): MonitorTaskFile => {
  const parsed = JSON.parse(content) as Partial<MonitorTaskFile>
  if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !parsed.tasks.every(isMonitorTask)) {
    throw new Error('本地监控任务数据格式无效。')
  }
  return { version: 1, tasks: parsed.tasks }
}

/**
 * JSON 仓库仅保存本产品的监控任务，不保存 Access Token、Secret 或 Cookie。
 * 所有写入先落临时文件再 rename，避免应用中断留下半份 JSON。
 */
export const createMonitorTaskStore = (filePath: string, dependencies: StoreDependencies = {}) => {
  const now = dependencies.now ?? (() => new Date())
  const createId = dependencies.createId ?? randomUUID
  let mutationQueue: Promise<unknown> = Promise.resolve()

  const readAll = async (): Promise<MonitorTask[]> => {
    try {
      const content = await readFile(filePath, 'utf8')
      return parseFile(content).tasks
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  const writeAll = async (tasks: MonitorTask[]) => {
    await mkdir(path.dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, filePath)
  }

  /** 串行化所有读改写操作，避免两个 IPC 同时提交时互相覆盖。 */
  const mutate = <T>(operation: (tasks: MonitorTask[]) => Promise<{ tasks: MonitorTask[]; result: T }>) => {
    const pending = mutationQueue.then(async () => {
      const current = await readAll()
      const next = await operation(current)
      await writeAll(next.tasks)
      return next.result
    })
    mutationQueue = pending.catch(() => undefined)
    return pending
  }

  return {
    list: async (filters: MonitorTaskFilters) => filterMonitorTasks(await readAll(), filters),
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
