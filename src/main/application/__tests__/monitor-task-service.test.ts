import { describe, expect, it, vi } from 'vitest'

import type { MonitorTask } from '../../../shared/contracts/monitor-task'
import { createMonitorTaskService } from '../monitor-task-service'

const task = {
  id: 'task-1',
  advertiserId: '186001',
  promotionPlanId: 'plan-1',
  promotionPlanName: '计划一',
  productName: '',
  productImage: '',
  platformStatus: '',
  groupName: '',
  status: 'RUNNING',
  rule: { metric: 'ROI', operator: 'LT', threshold: 1.5 },
  action: 'NOTICE',
  intervalMinutes: 5,
  createdAt: '2026-09-06T01:00:00.000Z',
  updatedAt: '2026-09-06T01:00:00.000Z',
  lastCheckedAt: null,
  lastResult: { status: 'PENDING', message: '等待首次检查' },
} satisfies MonitorTask

describe('监控任务应用服务', () => {
  it('只编排本地 Store，并保持稳定响应结构', async () => {
    const store = {
      list: vi.fn(async () => ({ tasks: [task], page: { current: 1, pageSize: 20, total: 1, totalPages: 1 } })),
      create: vi.fn(async () => [task]),
      update: vi.fn(async () => task),
      removeMany: vi.fn(async () => ['task-1']),
      setManyStatus: vi.fn(async () => [{ ...task, status: 'PAUSED' as const }]),
    }
    const runOnce = vi.fn(async () => ({
      outcome: 'checked' as const,
      checkedCount: 1,
      triggeredCount: 0,
      normalCount: 1,
      errorCount: 0,
      dataMissingCount: 0,
    }))
    const service = createMonitorTaskService({ store, scheduler: { runOnce } })

    await expect(service.list({ page: 1 })).resolves.toMatchObject({ ok: true, data: { tasks: [task] } })
    await expect(service.delete('task-1')).resolves.toEqual({
      ok: true,
      data: { deletedIds: ['task-1'] },
    })
    await expect(service.runNow(' 186001 ')).resolves.toMatchObject({ ok: true, data: { outcome: 'checked' } })
    expect(runOnce).toHaveBeenCalledWith({ force: true, advertiserId: '186001' })
  })

  it('调度器忙碌时返回 busy，而不是误报检查完成', async () => {
    const store = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      removeMany: vi.fn(),
      setManyStatus: vi.fn(),
    }
    const service = createMonitorTaskService({
      store,
      scheduler: {
        runOnce: async () => ({
          outcome: 'busy' as const,
          checkedCount: 0,
          triggeredCount: 0,
          normalCount: 0,
          errorCount: 0,
          dataMissingCount: 0,
        }),
      },
    })

    await expect(service.runNow('186001')).resolves.toEqual({
      ok: true,
      data: {
        outcome: 'busy',
        checkedCount: 0,
        triggeredCount: 0,
        normalCount: 0,
        errorCount: 0,
        dataMissingCount: 0,
      },
    })
  })
})
