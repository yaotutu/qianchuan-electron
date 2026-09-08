import type {
  MonitorRule,
  MonitorTask,
  MonitorTaskCheckResult,
  MonitorTaskStatus,
} from '../shared/contracts/monitor-task'
import type { MonitorPlanSnapshot } from './application/capabilities/promotion-plan'
import type { MonitorTaskRunOptions, MonitorTaskRunSummary } from './application/capabilities/monitor-task'

export type MonitorSchedulerStore = {
  listAll: () => Promise<MonitorTask[]>
  recordCheck: (taskId: string, checkedAt: Date, result: MonitorTaskCheckResult) => Promise<MonitorTask>
}

type SchedulerDependencies = {
  store: MonitorSchedulerStore
  fetchPlans: (advertiserId: string, promotionPlanIds: string[]) => Promise<MonitorPlanSnapshot[]>
  now?: () => Date
  notify?: (task: MonitorTask, result: MonitorTaskCheckResult) => void
  onTaskChanged?: (task: MonitorTask) => void
  timer?: {
    setInterval: (handler: () => void, timeout: number) => ReturnType<typeof setInterval>
    clearInterval: (handle: ReturnType<typeof setInterval>) => void
  }
  tickIntervalMs?: number
}

const METRIC_LABELS: Record<MonitorRule['metric'], string> = {
  ROI: '支付 ROI',
  COST: '消耗',
  BUDGET: '预算',
}

const OPERATOR_LABELS: Record<MonitorRule['operator'], string> = {
  GT: '大于',
  GTE: '大于等于',
  LT: '小于',
  LTE: '小于等于',
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const getMetricValue = (plan: MonitorPlanSnapshot, metric: MonitorRule['metric']) => {
  const value = metric === 'ROI' ? plan.metrics?.payRoi : metric === 'COST' ? plan.metrics?.costYuan : plan.budgetYuan
  return isFiniteNumber(value) ? value : null
}

const compare = (value: number, operator: MonitorRule['operator'], threshold: number) => {
  if (operator === 'GT') return value > threshold
  if (operator === 'GTE') return value >= threshold
  if (operator === 'LT') return value < threshold
  return value <= threshold
}

const formatNumber = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

/** 规则判断是纯函数，方便单测，也避免调度器里混入页面格式化逻辑。 */
export const evaluateMonitorRule = (
  task: MonitorTask,
  plan: MonitorPlanSnapshot | undefined,
): MonitorTaskCheckResult => {
  if (!plan) return { status: 'DATA_MISSING', message: '平台未返回该投放计划，可能已删除或当前账号无权限。' }

  const value = getMetricValue(plan, task.rule.metric)
  if (value === null) {
    return { status: 'DATA_MISSING', message: `暂未获取到${METRIC_LABELS[task.rule.metric]}数据。` }
  }

  const triggered = compare(value, task.rule.operator, task.rule.threshold)
  return {
    status: triggered ? 'TRIGGERED' : 'NORMAL',
    message: `${METRIC_LABELS[task.rule.metric]}当前为 ${formatNumber(value)}，${OPERATOR_LABELS[task.rule.operator]} ${formatNumber(task.rule.threshold)}。`,
  }
}

const isDue = (task: MonitorTask, now: Date) => {
  if (!task.lastCheckedAt) return true
  const lastCheckedAt = Date.parse(task.lastCheckedAt)
  if (!Number.isFinite(lastCheckedAt)) return true
  return now.getTime() - lastCheckedAt >= task.intervalMinutes * 60_000
}

const groupByAdvertiser = (tasks: MonitorTask[]) =>
  tasks.reduce<Map<string, MonitorTask[]>>((groups, task) => {
    const current = groups.get(task.advertiserId) ?? []
    groups.set(task.advertiserId, [...current, task])
    return groups
  }, new Map())

const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '平台数据读取失败。')

/**
 * Electron 本地调度器：只读取巨量平台 API 返回的计划数据，并把检查结果写回本地任务仓库。
 * 它不会调用千川写接口，也不会把 Token、Cookie 或 Secret 放到 Renderer。
 */
export const createMonitorScheduler = (dependencies: SchedulerDependencies) => {
  const now = dependencies.now ?? (() => new Date())
  const timer = dependencies.timer ?? {
    setInterval: (handler, timeout) => setInterval(handler, timeout),
    clearInterval: (handle) => clearInterval(handle),
  }
  const tickIntervalMs = dependencies.tickIntervalMs ?? 60_000
  let intervalHandle: ReturnType<typeof setInterval> | null = null
  /**
   * 同一广告主的读取和结果写回必须串行，避免手动运行与定时运行同时覆盖任务结果。
   * 不使用全局锁：不同广告主仍可以并行检查，减少一个账号异常对其他账号的阻塞。
   */
  const runningAdvertisers = new Set<string>()

  const checkTask = async (task: MonitorTask, plans: MonitorPlanSnapshot[], checkedAt: Date) => {
    const plan = plans.find((candidate) => candidate.id === task.promotionPlanId)
    const result = evaluateMonitorRule(task, plan)
    const updatedTask = await dependencies.store.recordCheck(task.id, checkedAt, result)
    dependencies.onTaskChanged?.(updatedTask)
    if (result.status === 'TRIGGERED' && task.lastResult.status !== 'TRIGGERED') {
      dependencies.notify?.(task, result)
    }
    return result.status
  }

  const runOnce = async (options: MonitorTaskRunOptions = {}): Promise<MonitorTaskRunSummary> => {
    const timestamp = now()
    const runningTasks = (await dependencies.store.listAll()).filter(
      (task) =>
        task.status === 'RUNNING' &&
        (!options.advertiserId || task.advertiserId === options.advertiserId) &&
        (options.force === true || isDue(task, timestamp)),
    )
    const groupedTasks = groupByAdvertiser(runningTasks)
    const availableGroups = [...groupedTasks.entries()].filter(([advertiserId]) => {
      if (runningAdvertisers.has(advertiserId)) return false
      runningAdvertisers.add(advertiserId)
      return true
    })
    const skipped = availableGroups.length < groupedTasks.size

    // 所有目标广告主都在运行时返回 skipped；没有到期任务则是正常的空检查，不混淆两种状态。
    if (availableGroups.length === 0) {
      return {
        checkedCount: 0,
        triggeredCount: 0,
        normalCount: 0,
        errorCount: 0,
        dataMissingCount: 0,
        skipped,
      }
    }

    try {
      const groupResults = await Promise.all(
        availableGroups.map(async ([advertiserId, tasks]) => {
          let plans: MonitorPlanSnapshot[]
          try {
            plans = await dependencies.fetchPlans(
              advertiserId,
              tasks.map((task) => task.promotionPlanId),
            )
          } catch (error) {
            const result: MonitorTaskCheckResult = {
              status: 'ERROR',
              message: `本次检查失败：${safeErrorMessage(error)}`,
            }
            await Promise.allSettled(
              tasks.map(async (task) => {
                const updatedTask = await dependencies.store.recordCheck(task.id, timestamp, result)
                dependencies.onTaskChanged?.(updatedTask)
              }),
            )
            return tasks.map(() => 'ERROR' as const)
          }

          // 用户可能在网络请求期间删除任务；单条写回失败不应中断同账号的其他任务。
          const settled = await Promise.allSettled(tasks.map((task) => checkTask(task, plans, timestamp)))
          return settled.map((item) => (item.status === 'fulfilled' ? item.value : ('ERROR' as const)))
        }),
      )
      const statuses = groupResults.flat()
      return {
        checkedCount: statuses.length,
        triggeredCount: statuses.filter((status) => status === 'TRIGGERED').length,
        normalCount: statuses.filter((status) => status === 'NORMAL').length,
        errorCount: statuses.filter((status) => status === 'ERROR').length,
        dataMissingCount: statuses.filter((status) => status === 'DATA_MISSING').length,
        skipped: false,
      }
    } finally {
      availableGroups.forEach(([advertiserId]) => runningAdvertisers.delete(advertiserId))
    }
  }

  return {
    runOnce,
    start: () => {
      if (intervalHandle) return
      intervalHandle = timer.setInterval(() => void runOnce(), tickIntervalMs)
      void runOnce()
    },
    stop: () => {
      if (!intervalHandle) return
      timer.clearInterval(intervalHandle)
      intervalHandle = null
    },
  }
}

export type MonitorScheduler = ReturnType<typeof createMonitorScheduler>
