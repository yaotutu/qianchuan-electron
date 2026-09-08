import { describe, expect, it } from 'vitest'
import {
  authorizationSchema,
  monitorTaskListResultSchema,
  promotionPlanListInputSchema,
  promotionPlanMonitorSelectionInputSchema,
  promotionPlanListResultSchema,
  promotionPlanResultSchema,
} from '../index'

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

  it('计划列表输入只接受业务字段，不兼容平台 snake_case 查询字段', () => {
    const result = promotionPlanListInputSchema.parse({
      advertiserId: '186001',
      dateRange: { startDate: '2026-09-01', unsafe: 'drop' },
      advertiser_id: 'legacy-field',
    })
    expect(result).toEqual({ advertiserId: '186001', dateRange: { startDate: '2026-09-01' } })
  })

  it('监控候选计划输入只保留广告主和场景业务字段', () => {
    expect(
      promotionPlanMonitorSelectionInputSchema.parse({
        advertiserId: '186001',
        scene: 'UNI_PROJECT',
        pageSize: 100,
      }),
    ).toEqual({ advertiserId: '186001', scene: 'UNI_PROJECT' })
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
    data: {
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
    },
  })
  expect(result.data.snapshot.identity.advertiserId).toBe('1001')
  expect(result.data.snapshot.creative.selectedStarProductIds).toEqual(['9101', '9102'])
  expect(result.data.snapshot.creative).not.toHaveProperty('unsafe')
  expect(result.data.snapshot).not.toHaveProperty('unsafe')
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

describe('授权契约', () => {
  it('Renderer 契约会剥离 Token 原文，只保留可展示字段', () => {
    const result = authorizationSchema.parse({
      ok: true,
      status: 'success',
      token: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: '2026-09-07T01:46:07.678Z',
        advertiserIds: ['186001'],
      },
    })

    expect(result.token).not.toHaveProperty('accessToken')
    expect(result.token).not.toHaveProperty('refreshToken')
    expect(result.token?.accessTokenExpiresAt).toBe('2026-09-07T01:46:07.678Z')
    expect(result.token?.advertiserIds).toEqual(['186001'])
  })
})

describe('计划列表 Result 契约', () => {
  it('成功分支只保留白名单 data，并裁剪列表、商品和指标中的未知字段', () => {
    const result = promotionPlanListResultSchema.parse({
      ok: true,
      data: {
        advertiserId: '186001',
        plans: [
          {
            id: 9001,
            name: '计划一',
            products: [{ id: 'product-1', name: '商品一', unsafe: 'drop' }],
            metrics: { costYuan: 12.5, unsafe: 'drop' },
            unsafe: 'drop',
          },
        ],
        page: { current: 1, unsafe: 'drop' },
        unsafe: 'drop',
      },
      requestId: 'must-not-cross-ipc',
    })

    expect(result).toEqual({
      ok: true,
      data: {
        advertiserId: '186001',
        plans: [
          {
            id: '9001',
            name: '计划一',
            products: [{ id: 'product-1', name: '商品一' }],
            metrics: { costYuan: 12.5 },
          },
        ],
        page: { current: 1 },
      },
    })
  })

  it('失败分支必须使用稳定错误对象，而不是旧式 status/message 结构', () => {
    expect(
      promotionPlanListResultSchema.parse({
        ok: false,
        error: {
          code: 'PLATFORM_UNAVAILABLE',
          message: '千川平台暂时不可用，请稍后重试。',
          retryable: true,
          unsafe: 'drop',
        },
        status: 'error',
        message: 'legacy message',
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'PLATFORM_UNAVAILABLE',
        message: '千川平台暂时不可用，请稍后重试。',
        retryable: true,
      },
    })

    expect(() => promotionPlanListResultSchema.parse({ ok: false, status: 'error', message: 'legacy' })).toThrow()
  })
})
