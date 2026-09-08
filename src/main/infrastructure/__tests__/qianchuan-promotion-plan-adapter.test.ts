import { describe, expect, it, vi } from 'vitest'

import { createQianchuanPromotionPlanAdapter } from '../qianchuan-promotion-plan-adapter'
import { QianchuanApiError, type QianchuanApiClient } from '../qianchuan-api-client'

const createApiClient = (
  request: QianchuanApiClient['request'] = vi.fn(async () => ({ code: 0, data: {} })),
  post: QianchuanApiClient['post'] = vi.fn(async () => ({ code: 0, request_id: 'write-request' })),
): QianchuanApiClient => ({ request, post })

describe('千川商品计划平台适配器', () => {
  it('负责构造平台 URL 并把列表响应转换成应用契约', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      request_id: 'list-request',
      data: {
        ad_list: [
          {
            ad_info: { id: 9001, name: '计划一', status: 'DELIVERY_OK', budget: 200 },
            stats_info: { stat_cost: 100000, total_prepay_and_pay_order_roi2: 2.5 },
            product_info: [],
          },
        ],
        page_info: { page: 1, page_size: 20, total_page: 1, total_num: 1 },
      },
    }))
    const adapter = createQianchuanPromotionPlanAdapter({ apiClient: createApiClient(request) })

    const result = await adapter.list({
      accessToken: 'access-token',
      authorizedAdvertiserIds: ['186001'],
      query: {
        advertiserId: '186001',
        keyword: '',
        status: 'ALL',
        scene: 'UNI_PROJECT',
        dateRange: { startDate: '2026-09-01', endDate: '2026-09-07' },
        pagination: { page: 1, pageSize: 20 },
      },
      now: () => Date.parse('2026-09-07T12:00:00.000Z'),
    })

    expect(result.plans).toEqual([
      expect.objectContaining({
        id: '9001',
        advertiserId: '186001',
        metrics: { costYuan: 1, payRoi: 2.5, payGmvYuan: 0, payOrderCount: 0, costPerPayOrderYuan: 0 },
      }),
    ])
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/open_api/v1.0/qianchuan/uni_promotion/list/'),
      'access-token',
      '获取商品投放计划',
    )
    const requestedUrl = new URL(request.mock.calls[0]?.[0] as string)
    expect(requestedUrl.searchParams.get('advertiser_id')).toBe('186001')
    expect(requestedUrl.searchParams.get('page_size')).toBe('20')
    expect(requestedUrl.searchParams.get('start_time')).toBe('2026-09-01 00:00:00')
    expect(requestedUrl.searchParams.get('end_time')).toBe('2026-09-07 23:59:59')
  })

  it('负责把详情和白名单写命令映射到平台请求', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      data: { ad_id: 9001, name: '计划一', delivery_setting: { budget: 200, roi2_goal: 2.5 } },
    }))
    const post = vi.fn(async () => ({ code: 0, request_id: 'budget-request' }))
    const adapter = createQianchuanPromotionPlanAdapter({ apiClient: createApiClient(request, post) })

    const detail = await adapter.getDetail({
      accessToken: 'access-token',
      authorizedAdvertiserIds: ['186001'],
      input: { advertiserId: '186001', adId: '9001' },
      fetchedAt: '2026-09-07T12:00:00.000Z',
    })
    const write = await adapter.executeWrite({
      accessToken: 'access-token',
      command: {
        operation: 'UPDATE_BUDGET',
        endpoint: '/open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/',
        changedFields: ['budgetYuan'],
        payload: { advertiser_id: 186001, update_budget_infos: [{ ad_id: 9001, budget: 300 }] },
      },
    })

    expect(detail.snapshot?.identity).toMatchObject({ advertiserId: '186001', adId: '9001' })
    expect(write).toEqual({ operation: 'UPDATE_BUDGET', ok: true, requestId: 'budget-request' })
    expect(post).toHaveBeenCalledWith(
      'https://api.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/',
      'access-token',
      expect.objectContaining({ advertiser_id: 186001 }),
      '更新计划预算',
    )
  })

  it('只把明确的平台 Token 错误识别为可刷新错误', () => {
    const adapter = createQianchuanPromotionPlanAdapter({ apiClient: createApiClient() })
    expect(
      adapter.isAccessTokenInvalid(new QianchuanApiError('Token 失效', '40105', undefined, 'Access token invalid')),
    ).toBe(true)
    expect(adapter.isAccessTokenInvalid(new QianchuanApiError('预算不足', '40030'))).toBe(false)
    expect(adapter.isAccessTokenInvalid(new Error('网络暂时不可用'))).toBe(false)
  })
})
