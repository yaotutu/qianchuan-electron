import { describe, expect, it, vi } from 'vitest'

import { createProductPlanSearch, createPromotionPlanService } from '../promotion-plan-service'
import type { TokenProvider } from '../promotion-plan-service'
import { QianchuanApiError, type QianchuanApiClient } from '../../infrastructure/qianchuan-api-client'
import { normalizeProductPlanDetailResponse } from '../../infrastructure/qianchuan-domain'

/** 创建 mock 千川 API 客户端 */
const createMockApiClient = (
  handler: (url: string, accessToken: string, operation: string) => Promise<Record<string, unknown>>,
  postHandler: (
    url: string,
    accessToken: string,
    body: Record<string, unknown>,
    operation: string,
  ) => Promise<Record<string, unknown>> = async () => ({ code: 0, request_id: 'write-request' }),
): QianchuanApiClient => ({
  request: vi.fn(handler),
  post: vi.fn(postHandler),
})

const detailPayload = (overrides: Record<string, unknown> = {}) => ({
  code: 0,
  data: {
    ad_id: 9001,
    name: '详情计划',
    status: 'DELIVERY_OK',
    delivery_setting: { budget: 200, roi2_goal: 2.5, budget_mode: 'BUDGET_MODE_DAY' },
    ...overrides,
  },
})

const createWriteInput = (payload: Record<string, unknown>, changes: Record<string, unknown>) => {
  const snapshot = normalizeProductPlanDetailResponse(payload, '186001', '2026-09-07T12:00:00.000Z').snapshot!
  return {
    draft: {
      advertiserId: '186001',
      adId: '9001',
      baseSnapshotId: snapshot.snapshotId,
      baseContentHash: snapshot.contentHash,
      changes,
    },
    confirmed: true as const,
  }
}

/** 创建 mock TokenProvider；refreshToken 用于模拟一次有界的 Token 刷新。 */
const createMockTokenProvider = ({
  accessToken = 'test-access-token',
  refreshedAccessToken = 'refreshed-access-token',
  advertiserIds = ['186001'],
}: {
  accessToken?: string | null
  refreshedAccessToken?: string | null | undefined
  advertiserIds?: string[]
} = {}): TokenProvider => ({
  getAccessToken: () => (accessToken === undefined ? 'test-access-token' : accessToken),
  getAdvertiserIds: () => advertiserIds,
  refreshAccessToken: vi.fn(async () => refreshedAccessToken),
})

describe('商品投放计划应用服务', () => {
  it('只把白名单筛选字段发送给巨量平台 API', () => {
    const search = createProductPlanSearch({
      advertiser_id: '186001',
      keyword: '秋季',
      page: 2,
      unexpected: '不能透传',
    } as never)

    expect(search.get('advertiser_id')).toBe('186001')
    expect(search.get('keyword')).toBe('秋季')
    expect(search.get('page')).toBe('2')
    expect(search.has('unexpected')).toBe(false)
  })

  it('按页读取监控快照，并在找到全部目标计划后停止', async () => {
    const apiClient = createMockApiClient(async (url) => {
      const page = new URL(url).searchParams.get('page')
      if (page === '1') {
        return {
          code: 0,
          data: {
            ad_list: [
              {
                ad_info: { id: 101, name: '计划一', budget: '200' },
                stats_info: {},
                product_info: [],
              },
            ],
            page_info: { page: 1, page_size: 100, total_page: 3, total_num: 3 },
          },
        }
      }
      return {
        code: 0,
        data: {
          ad_list: [
            {
              ad_info: { id: '102', name: '计划二', budget: 300 },
              stats_info: {},
              product_info: [],
            },
          ],
          page_info: { page: 2, page_size: 100, total_page: 3, total_num: 3 },
        },
      }
    })
    const tokenProvider = createMockTokenProvider({ accessToken: 'test-access-token', advertiserIds: ['186001'] })
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    const result = await service.getAllForMonitor('186001', ['101', '102'])

    expect(result).toEqual([
      { id: '101', name: '计划一', budgetYuan: 200, metrics: { costYuan: 0, payRoi: 0 } },
      { id: '102', name: '计划二', budgetYuan: 300, metrics: { costYuan: 0, payRoi: 0 } },
    ])
    expect(apiClient.request).toHaveBeenCalledTimes(2)
    // 验证请求 URL 包含 advertiser_id
    const firstCallUrl = vi.mocked(apiClient.request).mock.calls[0][0]
    expect(firstCallUrl).toContain('advertiser_id=186001')
    // 验证 Access Token 通过参数传入
    expect(vi.mocked(apiClient.request).mock.calls[0][1]).toBe('test-access-token')
  })

  it('平台判断 Access Token 失效时，刷新一次后重试请求', async () => {
    const request = vi.fn(async (url: string, accessToken: string) => {
      if (accessToken === 'expired-access-token') {
        throw new QianchuanApiError('获取商品投放计划被平台拒绝', '40105', 'request-token', 'Access token invalid')
      }
      return {
        code: 0,
        data: {
          ad_list: [{ ad_info: { id: 9001, name: '刷新后计划' }, stats_info: {}, product_info: [] }],
          page_info: { page: 1, page_size: 100, total_page: 1, total_num: 1 },
        },
      }
    })
    const apiClient = createMockApiClient(request)
    const tokenProvider = createMockTokenProvider({
      accessToken: 'expired-access-token',
      refreshedAccessToken: 'refreshed-access-token',
    })
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    const result = await service.list({ advertiser_id: '186001' })

    expect(result.plans[0]?.id).toBe('9001')
    expect(apiClient.request).toHaveBeenCalledTimes(2)
    expect(vi.mocked(apiClient.request).mock.calls.map(([, accessToken]) => accessToken)).toEqual([
      'expired-access-token',
      'refreshed-access-token',
    ])
    expect(tokenProvider.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('普通平台错误不会触发 Token 刷新', async () => {
    const apiClient = createMockApiClient(async () => {
      throw new QianchuanApiError('预算不足', '40030', 'request-budget', 'budget not enough')
    })
    const tokenProvider = createMockTokenProvider()
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    await expect(service.list({ advertiser_id: '186001' })).rejects.toThrow('预算不足')
    expect(apiClient.request).toHaveBeenCalledTimes(1)
    expect(tokenProvider.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('刷新失败时抛出原始平台错误，不做第二次重试', async () => {
    const apiClient = createMockApiClient(async () => {
      throw new QianchuanApiError('Token 失效', '40105', 'request-token', 'Access token invalid')
    })
    const tokenProvider = createMockTokenProvider({ accessToken: 'expired-access-token', refreshedAccessToken: null })
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    await expect(service.list({ advertiser_id: '186001' })).rejects.toThrow('Token 失效')
    expect(apiClient.request).toHaveBeenCalledTimes(1)
    expect(tokenProvider.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('未登录时抛出错误', async () => {
    const apiClient = createMockApiClient(async () => ({ code: 0, data: {} }))
    const tokenProvider = createMockTokenProvider({ accessToken: null, advertiserIds: [] })
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    await expect(service.list()).rejects.toThrow('当前未登录')
  })

  it('读取计划详情时直接调用巨量平台 API', async () => {
    const apiClient = createMockApiClient(async () => ({
      code: 0,
      data: { ad_id: 9001, name: '详情计划' },
    }))
    const tokenProvider = createMockTokenProvider({ accessToken: 'detail-access-token', advertiserIds: ['186001'] })
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    await service.getDetail({ advertiserId: '186001', adId: '9001' })

    expect(apiClient.request).toHaveBeenCalledTimes(1)
    const [url, accessToken] = vi.mocked(apiClient.request).mock.calls[0]
    expect(url).toContain('advertiser_id=186001')
    expect(url).toContain('ad_id=9001')
    expect(accessToken).toBe('detail-access-token')
  })

  it('Hash 一致时只调用官方预算与 ROI 增量接口，并在写后重新读取详情', async () => {
    const payload = detailPayload()
    const apiClient = createMockApiClient(async () => payload)
    const service = createPromotionPlanService({
      apiClient,
      tokenProvider: createMockTokenProvider(),
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })

    const result = await service.update(createWriteInput(payload, { budgetYuan: 300, roiGoal: 3.2 }))

    expect(result).toMatchObject({ ok: true, status: 'updated' })
    expect(apiClient.request).toHaveBeenCalledTimes(2)
    expect(apiClient.post).toHaveBeenCalledTimes(2)
    expect(vi.mocked(apiClient.post).mock.calls[0][0]).toBe(
      'https://api.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/',
    )
    expect(vi.mocked(apiClient.post).mock.calls[0][2]).toEqual({
      advertiser_id: 186001,
      update_budget_infos: [{ ad_id: 9001, budget: 300 }],
    })
    expect(vi.mocked(apiClient.post).mock.calls[1][0]).toBe(
      'https://api.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/',
    )
    expect(vi.mocked(apiClient.post).mock.calls[1][2]).toEqual({
      advertiser_id: 186001,
      update_roi2_infos: [{ ad_id: 9001, roi2_goal: 3.2 }],
    })
  })

  it('快照冲突、删除计划和不支持字段都不会发送 POST', async () => {
    const payload = detailPayload()
    const apiClient = createMockApiClient(async () => payload)
    const service = createPromotionPlanService({
      apiClient,
      tokenProvider: createMockTokenProvider(),
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })
    const conflictInput = createWriteInput(payload, { budgetYuan: 300 })
    conflictInput.draft.baseContentHash = 'a'.repeat(64)
    await expect(service.update(conflictInput)).resolves.toMatchObject({ ok: false, status: 'snapshot_conflict' })

    const nameOnly = createWriteInput(payload, { name: '不支持的名称' })
    await expect(service.update(nameOnly)).resolves.toMatchObject({ ok: false, status: 'preflight_failed' })

    // 删除场景使用独立客户端，避免复用前面始终返回正常计划的 Mock，导致测试草稿与主进程最新快照不一致。
    const deletedPayload = detailPayload({ status: 'DELETED' })
    const deletedClient = createMockApiClient(async () => deletedPayload)
    const deletedService = createPromotionPlanService({
      apiClient: deletedClient,
      tokenProvider: createMockTokenProvider(),
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })
    await expect(deletedService.update(createWriteInput(deletedPayload, { budgetYuan: 300 }))).resolves.toMatchObject({
      ok: false,
      status: 'plan_deleted',
    })
    expect(apiClient.post).not.toHaveBeenCalled()
    expect(deletedClient.post).not.toHaveBeenCalled()
  })

  it('建议预算模式和超出安全整数范围的 ID 会 fail-closed', async () => {
    const suggested = detailPayload({
      delivery_setting: { budget: 200, roi2_goal: 2.5, budget_mode: 'SUGGEST_BUDGET' },
    })
    const suggestedClient = createMockApiClient(async () => suggested)
    const suggestedService = createPromotionPlanService({
      apiClient: suggestedClient,
      tokenProvider: createMockTokenProvider(),
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })
    await expect(suggestedService.update(createWriteInput(suggested, { budgetYuan: 300 }))).resolves.toMatchObject({
      ok: false,
      status: 'preflight_failed',
    })
    expect(suggestedClient.post).not.toHaveBeenCalled()

    const unsafe = detailPayload({ ad_id: '9007199254740993' })
    const unsafeClient = createMockApiClient(async () => unsafe)
    const unsafeService = createPromotionPlanService({
      apiClient: unsafeClient,
      tokenProvider: createMockTokenProvider(),
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })
    const unsafeSnapshot = normalizeProductPlanDetailResponse(unsafe, '186001', '2026-09-07T12:00:00.000Z').snapshot!
    await expect(
      unsafeService.update({
        draft: {
          advertiserId: '186001',
          adId: unsafeSnapshot.identity.adId,
          baseSnapshotId: unsafeSnapshot.snapshotId,
          baseContentHash: unsafeSnapshot.contentHash,
          changes: { roiGoal: 3 },
        },
        confirmed: true,
      }),
    ).resolves.toMatchObject({ ok: false, status: 'preflight_failed' })
    expect(unsafeClient.post).not.toHaveBeenCalled()
  })

  it('第二个写步骤失败时明确返回部分成功，不宣称事务性', async () => {
    const payload = detailPayload()
    const apiClient = createMockApiClient(
      async () => payload,
      async (url) => {
        if (url.includes('roi2_goal')) throw new QianchuanApiError('更新 ROI 被平台拒绝', '40030')
        return { code: 0, request_id: 'budget-ok' }
      },
    )
    const service = createPromotionPlanService({
      apiClient,
      tokenProvider: createMockTokenProvider(),
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })
    const result = await service.update(createWriteInput(payload, { budgetYuan: 300, roiGoal: 3.2 }))
    expect(result).toMatchObject({ ok: false, status: 'partial_updated' })
    expect(result.steps).toEqual([
      expect.objectContaining({ operation: 'UPDATE_BUDGET', ok: true }),
      expect.objectContaining({ operation: 'UPDATE_ROI', ok: false }),
    ])
  })

  it('写接口遇到明确 Token 失效时只刷新一次', async () => {
    const payload = detailPayload()
    const post = vi.fn(async (_url: string, accessToken: string) => {
      if (accessToken === 'expired-access-token')
        throw new QianchuanApiError('Token 失效', '40105', 'r-token', 'Access token invalid')
      return { code: 0, request_id: 'write-after-refresh' }
    })
    const apiClient = createMockApiClient(async () => payload, post)
    const tokenProvider = createMockTokenProvider({
      accessToken: 'expired-access-token',
      refreshedAccessToken: 'refreshed-access-token',
    })
    const service = createPromotionPlanService({
      apiClient,
      tokenProvider,
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })
    await expect(service.update(createWriteInput(payload, { budgetYuan: 300 }))).resolves.toMatchObject({ ok: true })
    expect(post).toHaveBeenCalledTimes(2)
    expect(tokenProvider.refreshAccessToken).toHaveBeenCalledTimes(1)
  })
})
