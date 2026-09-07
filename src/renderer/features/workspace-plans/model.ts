import type { PromotionPlan } from '../../../shared/contracts'

/** 列表指标经过 IPC Schema 后均为有限数字；缺失值统一按 0 汇总，避免页面出现 NaN。 */
const metric = (value: number | string | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export type PromotionPlanSummary = {
  planCount: number
  activeCount: number
  spendingCount: number
  totalCostYuan: number
  totalPayGmvYuan: number
  totalPayOrderCount: number
  weightedPayRoi: number
  averagePayRoi: number
}

/**
 * 汇总函数保持纯函数和不可变输入，供推广数据与乘方数据复用。
 * “综合 ROI”优先使用总 GMV / 总消耗；当平台未返回 GMV 时才回退为有值计划的算术平均。
 */
export const summarizePromotionPlans = (plans: ReadonlyArray<PromotionPlan>): PromotionPlanSummary => {
  const totals = plans.reduce(
    (result, plan) => {
      const costYuan = metric(plan.metrics?.costYuan)
      const payGmvYuan = metric(plan.metrics?.payGmvYuan)
      const payRoi = metric(plan.metrics?.payRoi)
      return {
        activeCount: result.activeCount + (plan.status === 'DELIVERY_OK' ? 1 : 0),
        spendingCount: result.spendingCount + (costYuan > 0 ? 1 : 0),
        totalCostYuan: result.totalCostYuan + costYuan,
        totalPayGmvYuan: result.totalPayGmvYuan + payGmvYuan,
        totalPayOrderCount: result.totalPayOrderCount + metric(plan.metrics?.payOrderCount),
        roiSum: result.roiSum + (payRoi > 0 ? payRoi : 0),
        roiCount: result.roiCount + (payRoi > 0 ? 1 : 0),
      }
    },
    {
      activeCount: 0,
      spendingCount: 0,
      totalCostYuan: 0,
      totalPayGmvYuan: 0,
      totalPayOrderCount: 0,
      roiSum: 0,
      roiCount: 0,
    },
  )

  return {
    planCount: plans.length,
    activeCount: totals.activeCount,
    spendingCount: totals.spendingCount,
    totalCostYuan: totals.totalCostYuan,
    totalPayGmvYuan: totals.totalPayGmvYuan,
    totalPayOrderCount: totals.totalPayOrderCount,
    weightedPayRoi: totals.totalCostYuan > 0 ? totals.totalPayGmvYuan / totals.totalCostYuan : 0,
    averagePayRoi: totals.roiCount > 0 ? totals.roiSum / totals.roiCount : 0,
  }
}

export const filterPromotionPlans = (
  plans: ReadonlyArray<PromotionPlan>,
  keyword: string,
  status: string,
): PromotionPlan[] => {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-CN')
  return plans.filter((plan) => {
    const matchesStatus = status === 'ALL' || plan.status === status
    const searchable = [plan.name, plan.id, ...(plan.products ?? []).map((product) => product.name)]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN')
    return matchesStatus && (!normalizedKeyword || searchable.includes(normalizedKeyword))
  })
}
