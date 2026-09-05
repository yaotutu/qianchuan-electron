import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROMOTION_MONITOR_URL_STATE,
  parsePromotionMonitorSearchParams,
  updatePromotionMonitorSearchParams,
} from '../model'

describe('推广监控 URL 状态', () => {
  it('在没有参数时使用稳定默认值', () => {
    expect(parsePromotionMonitorSearchParams(new URLSearchParams())).toEqual(DEFAULT_PROMOTION_MONITOR_URL_STATE)
  })

  it('可以恢复账号、筛选、日期、分页和页签', () => {
    const params = new URLSearchParams(
      'account=186001&keyword=%E5%95%86%E5%93%81&status=DELIVERY_OK&scene=OVERALL_PROJECT&start=2026-09-01&end=2026-09-05&page=3&tab=create',
    )

    expect(parsePromotionMonitorSearchParams(params)).toEqual({
      accountId: '186001',
      keyword: '商品',
      status: 'DELIVERY_OK',
      scene: 'OVERALL_PROJECT',
      dates: ['2026-09-01', '2026-09-05'],
      page: 3,
      tab: 'create',
    })
  })

  it('非法枚举、日期和页码会回退且不会污染其他查询参数', () => {
    const current = new URLSearchParams('source=desktop&status=UNKNOWN&scene=UNKNOWN&start=bad&end=2026-09-05&page=-1')
    const parsed = parsePromotionMonitorSearchParams(current)
    const updated = updatePromotionMonitorSearchParams(current, {
      accountId: '186001',
      keyword: '测试计划',
      page: 2,
    })

    expect(parsed.status).toBe('ALL')
    expect(parsed.scene).toBe('UNI_PROJECT')
    expect(parsed.dates).toEqual([])
    expect(parsed.page).toBe(1)
    expect(updated.get('source')).toBe('desktop')
    expect(updated.get('account')).toBe('186001')
    expect(updated.get('keyword')).toBe('测试计划')
    expect(updated.get('page')).toBe('2')
    expect(updated.has('status')).toBe(false)
    expect(updated.has('scene')).toBe(false)
    expect(updated.has('start')).toBe(false)
    expect(updated.has('end')).toBe(false)
  })

  it('写入默认值时删除冗余参数', () => {
    const updated = updatePromotionMonitorSearchParams(new URLSearchParams('status=DELIVERY_OK&page=4&tab=create'), {
      status: 'ALL',
      page: 1,
      tab: 'manage',
    })

    expect(updated.toString()).toBe('')
  })
})
