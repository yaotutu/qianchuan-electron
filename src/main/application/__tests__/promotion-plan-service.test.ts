import { describe, expect, it, vi } from 'vitest'

import { createProductPlanSearch, createPromotionPlanService } from '../promotion-plan-service'
import type { TokenProvider } from '../promotion-plan-service'
import type { QianchuanApiClient } from '../../infrastructure/qianchuan-api-client'

/** 创建 mock 千川 API 客户端 */
const createMockApiClient = (
  handler: (url: string, accessToken: string, operation: string) => Promise<Record<string, unknown>>,
): QianchuanApiClient => ({
  request: vi.fn(handler),
})

/** 创建 mock TokenProvider */
const createMockTokenProvider = (
  accessToken = 'test-access-token',
  advertiserIds: string[] = ['186001'],
): TokenProvider => ({
  getAccessToken: () => accessToken,
  getAdvertiserIds: () => advertiserIds,
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
    const tokenProvider = createMockTokenProvider('test-access-token', ['186001'])
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

  it('未登录时抛出错误', async () => {
    const apiClient = createMockApiClient(async () => ({ code: 0, data: {} }))
    const tokenProvider = createMockTokenProvider(null, [])
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    await expect(service.list()).rejects.toThrow('当前未登录')
  })

  it('读取计划详情时直接调用巨量平台 API', async () => {
    const apiClient = createMockApiClient(async () => ({
      code: 0,
      data: { ad_id: 9001, name: '详情计划' },
    }))
    const tokenProvider = createMockTokenProvider('detail-access-token', ['186001'])
    const service = createPromotionPlanService({ apiClient, tokenProvider })

    await service.getDetail({ advertiserId: '186001', adId: '9001' })

    expect(apiClient.request).toHaveBeenCalledTimes(1)
    const [url, accessToken] = vi.mocked(apiClient.request).mock.calls[0]
    expect(url).toContain('advertiser_id=186001')
    expect(url).toContain('ad_id=9001')
    expect(accessToken).toBe('detail-access-token')
  })
})
