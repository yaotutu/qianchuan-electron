import { describe, expect, it } from 'vitest'
import type { MonitorTask } from '../../shared/contracts/monitor-task'
import { createMonitorTasks } from '../monitor-task-store'
import { createMonitorScheduler, evaluateMonitorRule, type MonitorPlanSnapshot } from '../monitor-scheduler'

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
      checkedCount: 1,
      triggeredCount: 0,
      normalCount: 0,
      errorCount: 1,
      dataMissingCount: 0,
      skipped: false,
    })
    expect(tasks[0].lastResult).toMatchObject({ status: 'ERROR', message: '本次检查失败：服务端暂时不可用' })
  })
})
