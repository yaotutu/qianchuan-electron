import { describe, expect, it } from 'vitest'
import type { MonitorTask } from '../../shared/contracts/monitor-task'
import { createMonitorTasks } from '../monitor-task-store'
import { createMonitorScheduler, evaluateMonitorRule } from '../monitor-scheduler'
import type { MonitorPlanSnapshot } from '../application/capabilities/promotion-plan'

const createdAt = new Date('2026-09-05T02:30:00.000Z')

const createTask = (overrides: Partial<MonitorTask> = {}) =>
  createMonitorTasks(
    {
      advertiserId: '186001',
      plans: [{ id: 'plan-1', name: '秋季商品卡计划' }],
      rule: { metric: 'ROI', operator: 'LT', threshold: 1.8 },
      action: 'NOTICE',
      intervalMinutes: 5,
      status: 'RUNNING',
    },
    createdAt,
    () => 'task-1',
  ).map((task) => ({ ...task, ...overrides }))[0]

describe('监控规则判断', () => {
  it('按平台指标判断触发和正常状态', () => {
    const task = createTask()
    const plan: MonitorPlanSnapshot = { id: 'plan-1', metrics: { payRoi: 1.2 } }

    expect(evaluateMonitorRule(task, plan)).toMatchObject({ status: 'TRIGGERED' })
    expect(evaluateMonitorRule(task, { ...plan, metrics: { payRoi: 2.1 } })).toMatchObject({ status: 'NORMAL' })
  })

  it('没有计划或指标时返回可展示的数据状态', () => {
    const task = createTask()

    expect(evaluateMonitorRule(task, undefined)).toMatchObject({ status: 'DATA_MISSING' })
    expect(evaluateMonitorRule(task, { id: 'plan-1' })).toMatchObject({ status: 'DATA_MISSING' })
  })
})

describe('本地监控调度器', () => {
  it('按广告主合并读取计划，并把触发结果写回任务', async () => {
    let tasks = [createTask()]
    const fetchedAdvertisers: string[] = []
    const notifications: string[] = []
    const changed: string[] = []
    const scheduler = createMonitorScheduler({
      store: {
        listAll: async () => tasks,
        recordCheck: async (taskId, checkedAt, result) => {
          tasks = tasks.map((task) =>
            task.id === taskId ? { ...task, lastCheckedAt: checkedAt.toISOString(), lastResult: result } : task,
          )
          return tasks.find((task) => task.id === taskId) as MonitorTask
        },
      },
      fetchPlans: async (advertiserId) => {
        fetchedAdvertisers.push(advertiserId)
        return [{ id: 'plan-1', metrics: { payRoi: 1.1 } }]
      },
      now: () => new Date('2026-09-05T02:35:00.000Z'),
      notify: (task) => notifications.push(task.id),
      onTaskChanged: (task) => changed.push(task.id),
    })

    await scheduler.runOnce()
    await scheduler.runOnce()

    expect(fetchedAdvertisers).toEqual(['186001'])
    expect(tasks[0].lastResult.status).toBe('TRIGGERED')
    expect(notifications).toEqual(['task-1'])
    expect(changed).toEqual(['task-1'])
  })

  it('同一广告主运行中时返回 busy，不重复发起平台读取', async () => {
    let tasks = [createTask()]
    let releaseFetch: ((plans: MonitorPlanSnapshot[]) => void) | undefined
    let markFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve
    })
    const scheduler = createMonitorScheduler({
      store: {
        listAll: async () => tasks,
        recordCheck: async (taskId, checkedAt, result) => {
          tasks = tasks.map((task) =>
            task.id === taskId ? { ...task, lastCheckedAt: checkedAt.toISOString(), lastResult: result } : task,
          )
          return tasks.find((task) => task.id === taskId) as MonitorTask
        },
      },
      fetchPlans: async () => {
        markFetchStarted?.()
        return new Promise<MonitorPlanSnapshot[]>((resolve) => {
          releaseFetch = resolve
        })
      },
      now: () => new Date('2026-09-05T02:35:00.000Z'),
    })

    const firstRun = scheduler.runOnce({ force: true })
    await fetchStarted

    await expect(scheduler.runOnce({ force: true })).resolves.toEqual({
      outcome: 'busy',
      checkedCount: 0,
      triggeredCount: 0,
      normalCount: 0,
      errorCount: 0,
      dataMissingCount: 0,
    })

    releaseFetch?.([{ id: 'plan-1', metrics: { payRoi: 1.1 } }])
    await expect(firstRun).resolves.toMatchObject({
      outcome: 'checked',
      checkedCount: 1,
    })
  })

  it('不同广告主可以并行读取，不会被彼此的运行锁阻塞', async () => {
    const firstTask = createTask()
    const secondTask = createTask({ id: 'task-2', advertiserId: '186002', promotionPlanId: 'plan-2' })
    const tasks = [firstTask, secondTask]
    const startedAdvertisers: string[] = []
    const releaseFetches = new Map<string, (plans: MonitorPlanSnapshot[]) => void>()
    let resolveBothStarted: (() => void) | undefined
    const bothStarted = new Promise<void>((resolve) => {
      resolveBothStarted = resolve
    })
    const scheduler = createMonitorScheduler({
      store: {
        listAll: async () => tasks,
        recordCheck: async (taskId, checkedAt, result) =>
          tasks.find((task) => task.id === taskId)
            ? ({
                ...tasks.find((task) => task.id === taskId),
                lastCheckedAt: checkedAt.toISOString(),
                lastResult: result,
              } as MonitorTask)
            : (undefined as never),
      },
      fetchPlans: async (advertiserId) => {
        startedAdvertisers.push(advertiserId)
        if (startedAdvertisers.length === 2) resolveBothStarted?.()
        return new Promise<MonitorPlanSnapshot[]>((resolve) => {
          releaseFetches.set(advertiserId, resolve)
        })
      },
      now: () => new Date('2026-09-05T02:35:00.000Z'),
    })

    const run = scheduler.runOnce({ force: true })
    await bothStarted
    expect(startedAdvertisers.sort()).toEqual(['186001', '186002'])

    releaseFetches.get('186001')?.([{ id: 'plan-1', metrics: { payRoi: 1.1 } }])
    releaseFetches.get('186002')?.([{ id: 'plan-2', metrics: { payRoi: 1.1 } }])

    await expect(run).resolves.toMatchObject({
      outcome: 'checked',
      checkedCount: 2,
    })
  })

  it('平台读取失败时记录错误，不让调度器崩溃', async () => {
    let tasks = [createTask()]
    const scheduler = createMonitorScheduler({
      store: {
        listAll: async () => tasks,
        recordCheck: async (taskId, checkedAt, result) => {
          tasks = tasks.map((task) =>
            task.id === taskId ? { ...task, lastCheckedAt: checkedAt.toISOString(), lastResult: result } : task,
          )
          return tasks.find((task) => task.id === taskId) as MonitorTask
        },
      },
      fetchPlans: async () => {
        throw new Error('服务端暂时不可用')
      },
      now: () => new Date('2026-09-05T02:35:00.000Z'),
    })

    await expect(scheduler.runOnce()).resolves.toEqual({
      outcome: 'checked',
      checkedCount: 1,
      triggeredCount: 0,
      normalCount: 0,
      errorCount: 1,
      dataMissingCount: 0,
    })
    expect(tasks[0].lastResult).toMatchObject({ status: 'ERROR', message: '本次检查失败：服务端暂时不可用' })
  })
})
