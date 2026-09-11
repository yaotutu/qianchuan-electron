import { describe, expect, it, vi } from 'vitest'

import type {
  PromotionPlanLegacyDetailResult,
  PromotionPlanDetailSnapshot,
  PromotionPlanResult,
} from '../../../shared/contracts/promotion-plan'
import type { PromotionPlanWriteInput } from '../../../shared/contracts/promotion-plan-write'
import { createPromotionPlanService } from '../promotion-plan-service'
import type { TokenProvider } from '../promotion-plan-service'
import type { PromotionPlanPlatformCapabilities } from '../capabilities/promotion-plan'

const fixedNow = new Date('2026-09-07T12:00:00.000Z')

const createSnapshot = (overrides: Partial<PromotionPlanDetailSnapshot> = {}): PromotionPlanDetailSnapshot => ({
  snapshotId: '9001:2026-09-07T12:00:00.000Z:base',
  fetchedAt: fixedNow.toISOString(),
  source: 'OCEANENGINE_OPEN_API',
  version: 1,
  contentHash: 'b'.repeat(64),
  identity: {
    advertiserId: '186001',
    adId: '9001',
    name: '详情计划',
    status: 'DELIVERY_OK',
  },
  delivery: {
    budgetMode: 'BUDGET_MODE_DAY',
    budgetYuan: 200,
    roiGoal: 2.5,
  },
  products: [],
  accounts: [],
  rooms: [],
  creative: {
    selectedStarProductIds: [],
    videoCount: 0,
    imageCount: 0,
    titleCount: 0,
    carouselCount: 0,
    blockedMaterialCount: 0,
    titles: [],
  },
  advanced: {
    overallRoiCostItems: [],
  },
  capabilities: {
    canEnable: true,
    canDisable: true,
    canDelete: true,
    canUpdateBudget: true,
    canUpdateRoi: true,
    canUpdateName: false,
    canUpdateSchedule: false,
    canUpdateFullConfig: false,
    reasons: [],
  },
  ...overrides,
})

const createDetailResult = (snapshot = createSnapshot()): PromotionPlanLegacyDetailResult => ({
  ok: true,
  status: 'ready',
  snapshot,
})

const createListResult = (page: number, plans: PromotionPlanResult['plans']): PromotionPlanResult => ({
  ok: true,
  advertiserId: '186001',
  plans,
  page: { current: page, totalPages: 3, total: 3 },
})

const createMockPlatform = ({
  list = async () => createListResult(1, []),
  getDetail = async () => createDetailResult(),
  executeWrite = async ({ command }: Parameters<PromotionPlanPlatformCapabilities['executeWrite']>[0]) => ({
    operation: command.operation,
    ok: true,
    requestId: 'write-request',
  }),
  isAccessTokenInvalid = (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { tokenInvalid?: boolean }).tokenInvalid === true),
}: Partial<PromotionPlanPlatformCapabilities> = {}): PromotionPlanPlatformCapabilities => ({
  list: vi.fn(list),
  getDetail: vi.fn(getDetail),
  executeWrite: vi.fn(executeWrite),
  isAccessTokenInvalid,
})

const createMockTokenProvider = ({
  accessToken = 'test-access-token',
  refreshedAccessToken = 'refreshed-access-token',
  advertiserIds = ['186001'],
}: {
  accessToken?: string | null
  refreshedAccessToken?: string | null | undefined
  advertiserIds?: string[]
} = {}): TokenProvider => ({
  getAccessToken: () => accessToken,
  getAdvertiserIds: () => advertiserIds,
  refreshAccessToken: vi.fn(async () => refreshedAccessToken),
})

const createWriteInput = (
  snapshot: PromotionPlanDetailSnapshot,
  changes: Record<string, unknown>,
): PromotionPlanWriteInput => ({
  draft: {
    advertiserId: snapshot.identity.advertiserId,
    adId: snapshot.identity.adId,
    baseSnapshotId: snapshot.snapshotId,
    baseContentHash: snapshot.contentHash,
    changes,
  },
  confirmed: true,
})

const tokenInvalidError = () => Object.assign(new Error('Token 失效'), { tokenInvalid: true })

describe('商品投放计划应用服务', () => {
  it('监控候选计划使用独立查询口径，不继承工作台日期和分页输入', async () => {
    const list = vi.fn(async ({ query }: Parameters<PromotionPlanPlatformCapabilities['list']>[0]) =>
      createListResult(query.pagination.page, []),
    )
    const service = createPromotionPlanService({
      platform: createMockPlatform({ list }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    await service.findPlansForMonitor({ advertiserId: '186001', scene: 'UNI_PROJECT' })

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          advertiserId: '186001',
          keyword: '',
          status: 'ALL',
          scene: 'UNI_PROJECT',
          dateRange: { startDate: undefined, endDate: undefined },
          pagination: { page: 1, pageSize: 100 },
        },
      }),
    )
  })

  it('按页读取监控快照，并在找到全部目标计划后停止', async () => {
    const list = vi.fn(async ({ query }: Parameters<PromotionPlanPlatformCapabilities['list']>[0]) => {
      const page = query.pagination.page
      if (page === 1) {
        return createListResult(1, [
          { id: '101', advertiserId: '186001', name: '计划一', budgetYuan: 200, metrics: {} },
        ])
      }
      return createListResult(2, [{ id: '102', advertiserId: '186001', name: '计划二', budgetYuan: 300, metrics: {} }])
    })
    const platform = createMockPlatform({ list })
    const service = createPromotionPlanService({
      platform,
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    await expect(service.getAllForMonitor('186001', ['101', '102'])).resolves.toEqual([
      { id: '101', name: '计划一', budgetYuan: 200, metrics: { costYuan: undefined, payRoi: undefined } },
      { id: '102', name: '计划二', budgetYuan: 300, metrics: { costYuan: undefined, payRoi: undefined } },
    ])
    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        accessToken: 'test-access-token',
        authorizedAdvertiserIds: ['186001'],
        query: {
          advertiserId: '186001',
          keyword: '',
          status: 'ALL',
          scene: 'UNI_PROJECT',
          dateRange: { startDate: '2026-09-07', endDate: '2026-09-07' },
          pagination: { page: 1, pageSize: 100 },
        },
      }),
    )
  })

  it('平台判断 Access Token 失效时，刷新一次后重试请求', async () => {
    const list = vi.fn(async ({ accessToken }: Parameters<PromotionPlanPlatformCapabilities['list']>[0]) => {
      if (accessToken === 'expired-access-token') throw tokenInvalidError()
      return createListResult(1, [{ id: '9001', advertiserId: '186001', name: '刷新后计划', metrics: {} }])
    })
    const platform = createMockPlatform({ list })
    const tokenProvider = createMockTokenProvider({
      accessToken: 'expired-access-token',
      refreshedAccessToken: 'refreshed-access-token',
    })
    const service = createPromotionPlanService({ platform, tokenProvider })

    await expect(service.list({ advertiserId: '186001' })).resolves.toMatchObject({ plans: [{ id: '9001' }] })
    expect(list.mock.calls.map(([input]) => input.accessToken)).toEqual([
      'expired-access-token',
      'refreshed-access-token',
    ])
    expect(tokenProvider.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('普通平台错误不会触发 Token 刷新', async () => {
    const list = vi.fn(async () => {
      throw new Error('预算不足')
    })
    const tokenProvider = createMockTokenProvider()
    const service = createPromotionPlanService({ platform: createMockPlatform({ list }), tokenProvider })

    await expect(service.list({ advertiserId: '186001' })).rejects.toThrow('预算不足')
    expect(tokenProvider.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('刷新失败时抛出原始平台错误，不做第二次重试', async () => {
    const list = vi.fn(async () => {
      throw tokenInvalidError()
    })
    const tokenProvider = createMockTokenProvider({ accessToken: 'expired-access-token', refreshedAccessToken: null })
    const service = createPromotionPlanService({ platform: createMockPlatform({ list }), tokenProvider })

    await expect(service.list({ advertiserId: '186001' })).rejects.toThrow('Token 失效')
    expect(list).toHaveBeenCalledTimes(1)
    expect(tokenProvider.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('未登录时抛出错误', async () => {
    const tokenProvider = createMockTokenProvider({ accessToken: null, advertiserIds: [] })
    const service = createPromotionPlanService({ platform: createMockPlatform(), tokenProvider })

    await expect(service.list()).rejects.toThrow('当前未登录')
  })

  it('读取计划详情时只调用平台能力函数', async () => {
    const getDetail = vi.fn(async () => createDetailResult())
    const platform = createMockPlatform({ getDetail })
    const service = createPromotionPlanService({
      platform,
      tokenProvider: createMockTokenProvider({ accessToken: 'detail-access-token' }),
      now: () => fixedNow,
    })

    await service.getDetail({ advertiserId: '186001', adId: '9001' })

    expect(getDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'detail-access-token',
        authorizedAdvertiserIds: ['186001'],
        fetchedAt: fixedNow.toISOString(),
      }),
    )
  })

  it('Hash 一致时只调用白名单写能力，并在写后重新读取详情', async () => {
    const snapshot = createSnapshot()
    const getDetail = vi.fn(async () => createDetailResult(snapshot))
    const executeWrite = vi.fn(
      async ({ command }: Parameters<PromotionPlanPlatformCapabilities['executeWrite']>[0]) => ({
        operation: command.operation,
        ok: true,
        requestId: `${command.operation}-request`,
      }),
    )
    const platform = createMockPlatform({ getDetail, executeWrite })
    const service = createPromotionPlanService({
      platform,
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    const result = await service.update(createWriteInput(snapshot, { budgetYuan: 300, roiGoal: 3.2 }))

    expect(result).toMatchObject({ ok: true, data: { status: 'updated' } })
    expect(getDetail).toHaveBeenCalledTimes(2)
    expect(executeWrite).toHaveBeenCalledTimes(2)
    expect(executeWrite.mock.calls.map(([input]) => input.command.operation)).toEqual(['UPDATE_BUDGET', 'UPDATE_ROI'])
  })

  it('快照冲突、删除计划和不支持字段都不会执行写能力', async () => {
    const snapshot = createSnapshot()
    const executeWrite = vi.fn()
    const platform = createMockPlatform({ getDetail: async () => createDetailResult(snapshot), executeWrite })
    const service = createPromotionPlanService({
      platform,
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    const conflictInput = createWriteInput(snapshot, { budgetYuan: 300 })
    conflictInput.draft.baseContentHash = 'a'.repeat(64)
    await expect(service.update(conflictInput)).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })

    await expect(service.update(createWriteInput(snapshot, { name: '不支持的名称' }))).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    })

    const deletedSnapshot = createSnapshot({
      identity: { ...snapshot.identity, status: 'DELETED' },
    })
    const deletedPlatform = createMockPlatform({
      getDetail: async () => createDetailResult(deletedSnapshot),
      executeWrite,
    })
    const deletedService = createPromotionPlanService({
      platform: deletedPlatform,
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })
    await expect(deletedService.update(createWriteInput(deletedSnapshot, { budgetYuan: 300 }))).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(executeWrite).not.toHaveBeenCalled()
  })

  it('建议预算模式和超出安全整数范围的 ID 会 fail-closed', async () => {
    const suggestedSnapshot = createSnapshot({
      delivery: { ...createSnapshot().delivery, budgetMode: 'SUGGEST_BUDGET' },
    })
    const suggestedExecuteWrite = vi.fn()
    const suggestedService = createPromotionPlanService({
      platform: createMockPlatform({
        getDetail: async () => createDetailResult(suggestedSnapshot),
        executeWrite: suggestedExecuteWrite,
      }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })
    await expect(
      suggestedService.update(createWriteInput(suggestedSnapshot, { budgetYuan: 300 })),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(suggestedExecuteWrite).not.toHaveBeenCalled()

    const unsafeSnapshot = createSnapshot({
      identity: { ...createSnapshot().identity, adId: '9007199254740993' },
    })
    const unsafeExecuteWrite = vi.fn()
    const unsafeService = createPromotionPlanService({
      platform: createMockPlatform({
        getDetail: async () => createDetailResult(unsafeSnapshot),
        executeWrite: unsafeExecuteWrite,
      }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })
    await expect(unsafeService.update(createWriteInput(unsafeSnapshot, { roiGoal: 3 }))).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(unsafeExecuteWrite).not.toHaveBeenCalled()
  })

  it('第二个写步骤失败时明确返回部分成功，不宣称事务性', async () => {
    const snapshot = createSnapshot()
    const executeWrite = vi.fn(
      async ({ command }: Parameters<PromotionPlanPlatformCapabilities['executeWrite']>[0]) => {
        if (command.operation === 'UPDATE_ROI') throw new Error('更新 ROI 被平台拒绝')
        return { operation: command.operation, ok: true, requestId: 'budget-ok' }
      },
    )
    const service = createPromotionPlanService({
      platform: createMockPlatform({ getDetail: async () => createDetailResult(snapshot), executeWrite }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    const result = await service.update(createWriteInput(snapshot, { budgetYuan: 300, roiGoal: 3.2 }))
    expect(result).toMatchObject({ ok: true, data: { status: 'partial_updated' } })
    expect(result.ok && result.data.steps).toEqual([
      expect.objectContaining({ operation: 'UPDATE_BUDGET', ok: true }),
      expect.objectContaining({ operation: 'UPDATE_ROI', ok: false }),
    ])
  })

  it('写能力遇到明确 Token 失效时只刷新一次', async () => {
    const snapshot = createSnapshot()
    const executeWrite = vi.fn(
      async ({ accessToken, command }: Parameters<PromotionPlanPlatformCapabilities['executeWrite']>[0]) => {
        if (accessToken === 'expired-access-token') throw tokenInvalidError()
        return { operation: command.operation, ok: true, requestId: 'write-after-refresh' }
      },
    )
    const tokenProvider = createMockTokenProvider({
      accessToken: 'expired-access-token',
      refreshedAccessToken: 'refreshed-access-token',
    })
    const service = createPromotionPlanService({
      platform: createMockPlatform({ getDetail: async () => createDetailResult(snapshot), executeWrite }),
      tokenProvider,
      now: () => fixedNow,
    })

    await expect(service.update(createWriteInput(snapshot, { budgetYuan: 300 }))).resolves.toMatchObject({ ok: true })
    expect(executeWrite).toHaveBeenCalledTimes(2)
    expect(tokenProvider.refreshAccessToken).toHaveBeenCalledTimes(1)
  })
})

describe('计划列表 Result 适配器', () => {
  it('将成功的旧列表结果转换为稳定的 Result<T> data', async () => {
    const platform = createMockPlatform({
      list: async () =>
        createListResult(1, [{ id: '9001', advertiserId: '186001', name: '计划一', budgetYuan: 200, metrics: {} }]),
    })
    const service = createPromotionPlanService({
      platform,
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    await expect(service.listResult({ advertiserId: '186001' })).resolves.toEqual({
      ok: true,
      data: {
        advertiserId: '186001',
        plans: [{ id: '9001', advertiserId: '186001', name: '计划一', budgetYuan: 200, metrics: {} }],
        page: { current: 1, totalPages: 3, total: 3 },
      },
    })
  })

  it('未登录时返回 UNAUTHORIZED，不把异常抛给 IPC 调用方', async () => {
    const service = createPromotionPlanService({
      platform: createMockPlatform(),
      tokenProvider: createMockTokenProvider({ accessToken: null }),
      now: () => fixedNow,
    })

    await expect(service.listResult()).resolves.toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '当前未登录，请先完成巨量千川授权。',
        retryable: false,
      },
    })
  })

  it('网络错误和平台鉴权错误分别映射为可重试与需重新授权的错误码', async () => {
    const unavailableService = createPromotionPlanService({
      platform: createMockPlatform({
        list: async () => {
          throw new Error('网络请求失败')
        },
      }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })
    await expect(unavailableService.listResult()).resolves.toMatchObject({
      ok: false,
      error: { code: 'PLATFORM_UNAVAILABLE', retryable: true },
    })

    const unauthorizedError = Object.assign(new Error('平台鉴权失败'), { platformCode: 40105 })
    const unauthorizedService = createPromotionPlanService({
      platform: createMockPlatform({
        list: async () => {
          throw unauthorizedError
        },
      }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })
    await expect(unauthorizedService.listResult()).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED', retryable: false },
    })
  })

  it('普通平台业务错误映射为 PLATFORM_BUSINESS_ERROR', async () => {
    const service = createPromotionPlanService({
      platform: createMockPlatform({
        list: async () => {
          throw new Error('计划被平台拒绝')
        },
      }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    await expect(service.listResult()).resolves.toMatchObject({
      ok: false,
      error: { code: 'PLATFORM_BUSINESS_ERROR', retryable: false },
    })
  })
})

describe('计划详情 Result 适配器', () => {
  it('将旧详情结果转换为只包含快照 data 的稳定 Result', async () => {
    const snapshot = createSnapshot()
    const service = createPromotionPlanService({
      platform: createMockPlatform({ getDetail: async () => createDetailResult(snapshot) }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    await expect(service.getDetailResult({ advertiserId: '186001', adId: '9001' })).resolves.toEqual({
      ok: true,
      data: { snapshot },
    })
  })

  it('详情缺少有效快照时 fail-closed，不返回不完整成功结果', async () => {
    const service = createPromotionPlanService({
      platform: createMockPlatform({
        getDetail: async () => ({ ok: true, message: '平台未返回详情' }),
      }),
      tokenProvider: createMockTokenProvider(),
      now: () => fixedNow,
    })

    await expect(service.getDetailResult({ advertiserId: '186001', adId: '9001' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'PLATFORM_BUSINESS_ERROR',
        message: '平台未返回详情',
        retryable: false,
      },
    })
  })

  it('详情读取沿用统一错误分类，未登录时返回 UNAUTHORIZED', async () => {
    const service = createPromotionPlanService({
      platform: createMockPlatform(),
      tokenProvider: createMockTokenProvider({ accessToken: null }),
      now: () => fixedNow,
    })

    await expect(service.getDetailResult({ advertiserId: '186001', adId: '9001' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '当前未登录，请先完成巨量千川授权。',
        retryable: false,
      },
    })
  })
})
