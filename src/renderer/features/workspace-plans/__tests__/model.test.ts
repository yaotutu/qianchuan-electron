import { describe, expect, it } from 'vitest'
import { filterPromotionPlans, summarizePromotionPlans } from '../model'

const plans = [
  {
    id: '1',
    advertiserId: '186001',
    name: '计划甲',
    status: 'DELIVERY_OK',
    products: [{ name: '连衣裙' }],
    metrics: { costYuan: 100, payRoi: 2, payGmvYuan: 250, payOrderCount: 5 },
  },
  {
    id: '2',
    advertiserId: '186001',
    name: '计划乙',
    status: 'DISABLE',
    products: [{ name: '鞋子' }],
    metrics: { costYuan: 0, payRoi: 1.5, payGmvYuan: 0, payOrderCount: 0 },
  },
]

describe('工作台计划汇总', () => {
  it('计算计划、消耗、GMV 与综合 ROI', () => {
    expect(summarizePromotionPlans(plans)).toMatchObject({
      planCount: 2,
      activeCount: 1,
      spendingCount: 1,
      totalCostYuan: 100,
      totalPayGmvYuan: 250,
      weightedPayRoi: 2.5,
    })
  })
  it('按状态与计划/商品关键词过滤', () => {
    expect(filterPromotionPlans(plans, '连衣裙', 'DELIVERY_OK').map((plan) => plan.id)).toEqual(['1'])
    expect(filterPromotionPlans(plans, '2', 'ALL').map((plan) => plan.id)).toEqual(['2'])
  })
})
