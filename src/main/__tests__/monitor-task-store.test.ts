import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createJsonMonitorTaskPersistence } from '../infrastructure/json-monitor-task-persistence'
import {
  MonitorTaskValidationError,
  createMonitorTaskStore,
  createMonitorTasks,
  filterMonitorTasks,
  updateMonitorTask,
} from '../monitor-task-store'

const temporaryDirectories: string[] = []
const fixedNow = new Date('2026-09-05T02:30:00.000Z')
const validInput = {
  advertiserId: '186001',
  plans: [
    {
      id: 'plan-1',
      name: '秋季商品卡计划',
      productName: '测试商品',
      productImage: 'https://example.com/product.png',
      status: 'DELIVERY_OK',
    },
  ],
  groupName: '重点商品',
  status: 'RUNNING' as const,
  rule: { metric: 'ROI' as const, operator: 'LT' as const, threshold: 1.8 },
  action: 'NOTICE' as const,
  intervalMinutes: 5,
}

const createFixture = () => createMonitorTasks(validInput, fixedNow, () => 'task-1')[0]

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('监控任务领域逻辑', () => {
  it('从计划快照创建本地监控任务', () => {
    expect(createFixture()).toMatchObject({
      id: 'task-1',
      advertiserId: '186001',
      promotionPlanId: 'plan-1',
      status: 'RUNNING',
      action: 'NOTICE',
      intervalMinutes: 5,
      lastResult: { status: 'PENDING', message: '等待首次检查' },
    })
  })

  it('拒绝非法规则和真实计划写动作', () => {
    expect(() =>
      createMonitorTasks(
        { ...validInput, rule: { metric: 'ROI', operator: 'LT', threshold: -1 } },
        fixedNow,
        () => 'x',
      ),
    ).toThrow(MonitorTaskValidationError)
    expect(() => createMonitorTasks({ ...validInput, action: 'PAUSE' as never }, fixedNow, () => 'x')).toThrow(
      '当前版本只支持通知和记录',
    )
  })

  it('只修改允许编辑的任务字段', () => {
    const updated = updateMonitorTask(
      createFixture(),
      { status: 'PAUSED', intervalMinutes: 10, rule: { metric: 'COST', operator: 'GTE', threshold: 500 } },
      new Date('2026-09-05T03:00:00.000Z'),
    )
    expect(updated).toMatchObject({
      promotionPlanId: 'plan-1',
      status: 'PAUSED',
      intervalMinutes: 10,
      rule: { metric: 'COST', operator: 'GTE', threshold: 500 },
      updatedAt: '2026-09-05T03:00:00.000Z',
    })
  })

  it('支持按账号、关键词、状态和指标筛选分页', () => {
    const first = createFixture()
    const second = {
      ...first,
      id: 'task-2',
      advertiserId: '186002',
      promotionPlanName: '直播引流计划',
      status: 'PAUSED' as const,
      rule: { metric: 'COST' as const, operator: 'GT' as const, threshold: 100 },
      updatedAt: '2026-09-05T04:00:00.000Z',
    }
    const result = filterMonitorTasks([first, second], {
      advertiserId: '186002',
      keyword: '直播',
      status: 'PAUSED',
      metric: 'COST',
      action: 'NOTICE',
      page: 1,
      pageSize: 1,
    })
    expect(result.tasks.map((task) => task.id)).toEqual(['task-2'])
    expect(result.page).toEqual({ current: 1, pageSize: 1, total: 1, totalPages: 1 })
  })
})

describe('监控任务本地仓库', () => {
  it('批量修改状态并在重新创建仓库后恢复文件数据', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'qianchuan-monitor-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'monitor-tasks.json')
    let sequence = 0
    const dependencies = {
      now: () => fixedNow,
      createId: () => `task-${++sequence}`,
    }
    const store = createMonitorTaskStore(createJsonMonitorTaskPersistence(filePath), dependencies)
    const created = await store.create({
      ...validInput,
      plans: [...validInput.plans, { id: 'plan-2', name: '第二条计划' }],
    })
    await store.setManyStatus(
      created.map((task) => task.id),
      'PAUSED',
    )

    const restored = await createMonitorTaskStore(createJsonMonitorTaskPersistence(filePath)).list({
      status: 'PAUSED',
      page: 1,
      pageSize: 20,
    })
    expect(restored.page.total).toBe(2)
    expect(restored.tasks.every((task) => task.status === 'PAUSED')).toBe(true)

    const deleted = await store.removeMany([created[0].id])
    expect(deleted).toEqual([created[0].id])
    expect((await store.list({ page: 1, pageSize: 20 })).page.total).toBe(1)
  })
})
