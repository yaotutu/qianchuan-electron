import { describe, expect, it } from 'vitest'
import { promotionPlanQueryKeys } from '../query-keys'

describe('计划查询 Query Key', () => {
  it('覆盖广告主、筛选条件、日期范围和分页，避免复用不相干缓存', () => {
    const base = promotionPlanQueryKeys.list({
      advertiserId: '186001',
      keyword: '测试计划',
      status: 'ALL',
      scene: 'UNI_PROJECT',
      dateRange: { startDate: '2026-09-08', endDate: '2026-09-08' },
      page: 1,
      pageSize: 100,
    })
    const changed = promotionPlanQueryKeys.list({
      advertiserId: '186001',
      keyword: '测试计划',
      status: 'DELIVERY_OK',
      scene: 'UNI_PROJECT',
      dateRange: { startDate: '2026-09-08', endDate: '2026-09-08' },
      page: 1,
      pageSize: 100,
    })

    expect(base).not.toEqual(changed)
  })

  it('对缺省值和仅有空白的输入使用相同的稳定 Key', () => {
    expect(promotionPlanQueryKeys.list({ advertiserId: ' 186001 ', keyword: ' ', dateRange: {} })).toEqual(
      promotionPlanQueryKeys.list({
        advertiserId: '186001',
        keyword: '',
        status: '',
        scene: '',
        dateRange: { startDate: '', endDate: '' },
        page: 1,
        pageSize: 20,
      }),
    )
  })

  it('监控候选计划 Key 与普通列表缓存隔离，并覆盖广告主和场景', () => {
    expect(promotionPlanQueryKeys.monitorSelection({ advertiserId: '186001', scene: 'UNI_PROJECT' })).not.toEqual(
      promotionPlanQueryKeys.monitorSelection({ advertiserId: '186002', scene: 'UNI_PROJECT' }),
    )
    expect(promotionPlanQueryKeys.monitorSelection({ advertiserId: '186001', scene: 'UNI_PROJECT' })).not.toEqual(
      promotionPlanQueryKeys.list({ advertiserId: '186001', scene: 'UNI_PROJECT' }),
    )
  })

  it('详情 Key 同时隔离广告主和计划 ID', () => {
    expect(promotionPlanQueryKeys.detail({ advertiserId: '186001', adId: '9001' })).not.toEqual(
      promotionPlanQueryKeys.detail({ advertiserId: '186002', adId: '9001' }),
    )
  })
})
