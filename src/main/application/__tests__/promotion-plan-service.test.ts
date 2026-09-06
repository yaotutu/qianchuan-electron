import { describe, expect, it, vi } from 'vitest'

import type { OAuthServerClient } from '../../infrastructure/oauth-server-client'
import { createProductPlanSearch, createPromotionPlanService } from '../promotion-plan-service'

describe('商品投放计划应用服务', () => {
  it('只把白名单筛选字段发送给独立 OAuth 服务', () => {
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
    const request = vi.fn<OAuthServerClient['request']>(async (pathname) => {
      const page = new URL(`http://localhost${pathname}`).searchParams.get('page')
      if (page === '1') {
        return {
          plans: [{ id: 101, name: '计划一', budgetYuan: '200', metrics: { payRoi: '1.5' } }],
          page: { totalPages: 3 },
        }
      }
      return {
        plans: [{ id: '102', name: '计划二', budgetYuan: 300, metrics: { costYuan: 40 } }],
        page: { totalPages: 3 },
      }
    })
    const service = createPromotionPlanService({ request })

    await expect(service.getAllForMonitor('186001', ['101', '102'])).resolves.toEqual([
      { id: '101', name: '计划一', budgetYuan: 200, metrics: { costYuan: undefined, payRoi: 1.5 } },
      { id: '102', name: '计划二', budgetYuan: 300, metrics: { costYuan: 40, payRoi: undefined } },
    ])
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][0]).toContain('advertiser_id=186001')
  })
})
