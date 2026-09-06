import { describe, expect, it } from 'vitest'
import { authorizationSchema, monitorTaskListResultSchema, promotionPlanResultSchema } from '../index'

describe('Electron 共享契约', () => {
  it('把数字广告主 ID 统一转成字符串', () => {
    const result = authorizationSchema.parse({
      ok: true,
      status: 'success',
      token: { advertiserIds: [1842135619673292] },
    })
    expect(result.token?.advertiserIds).toEqual(['1842135619673292'])
  })

  it('保留计划业务字段并提供空列表默认值', () => {
    const result = promotionPlanResultSchema.parse({ ok: true, page: { total: 0 } })
    expect(result.plans).toEqual([])
  })

  it('为缺少字段的监控列表提供安全默认值', () => {
    const result = monitorTaskListResultSchema.parse({ ok: true })
    expect(result.tasks).toEqual([])
  })
})

it('详情输入拒绝非数字计划 ID，并裁剪快照未知字段', async () => {
  const { promotionPlanDetailInputSchema, promotionPlanDetailResultSchema } = await import('../promotion-plan')
  expect(() => promotionPlanDetailInputSchema.parse({ advertiserId: '1001', adId: 'bad' })).toThrow()
  const result = promotionPlanDetailResultSchema.parse({
    ok: true,
    snapshot: {
      snapshotId: '9001:snapshot',
      fetchedAt: '2026-09-06T02:33:00.000Z',
      source: 'OCEANENGINE_OPEN_API',
      version: 1,
      contentHash: 'a'.repeat(64),
      identity: { advertiserId: 1001, adId: 9001, unsafe: 'drop' },
      delivery: {},
      products: [],
      accounts: [],
      rooms: [],
      creative: {
        liveRoomViewEnabled: true,
        selfSelectedVideoEnabled: false,
        selectedStarProductIds: [9101, '9102'],
        videoCount: 0,
        imageCount: 0,
        titleCount: 0,
        carouselCount: 0,
        blockedMaterialCount: 0,
        titles: [],
        unsafe: 'drop',
      },
      advanced: { overallRoiCostItems: [] },
      capabilities: {
        canEnable: false,
        canDisable: false,
        canDelete: false,
        canUpdateBudget: false,
        canUpdateRoi: false,
        canUpdateName: false,
        canUpdateSchedule: false,
        canUpdateFullConfig: false,
        reasons: [],
      },
      unsafe: 'drop',
    },
  })
  expect(result.snapshot?.identity.advertiserId).toBe('1001')
  expect(result.snapshot?.creative.selectedStarProductIds).toEqual(['9101', '9102'])
  expect(result.snapshot?.creative).not.toHaveProperty('unsafe')
  expect(result.snapshot).not.toHaveProperty('unsafe')
})

it('修改草稿只保留声明字段，并校验快照内容摘要', async () => {
  const { promotionPlanEditDraftSchema } = await import('../promotion-plan')
  const result = promotionPlanEditDraftSchema.parse({
    advertiserId: '1001',
    adId: '9001',
    baseSnapshotId: 'snapshot-1',
    baseContentHash: 'a'.repeat(64),
    changes: { name: '测试计划', budgetYuan: 120, unsafe: 'drop' },
    unsafe: 'drop',
  })

  expect(result.changes).toEqual({ name: '测试计划', budgetYuan: 120 })
  expect(result).not.toHaveProperty('unsafe')
  expect(() => promotionPlanEditDraftSchema.parse({ ...result, baseContentHash: 'bad' })).toThrow()
})
