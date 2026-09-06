import type { PromotionPlanDetailInput, PromotionPlanFilters } from '../../shared/contracts/promotion-plan'
import type { MonitorPlanSnapshot } from '../monitor-scheduler'
import type { JsonRecord, OAuthServerClient } from '../infrastructure/oauth-server-client'

type PromotionPlanQuery = Partial<PromotionPlanFilters>

const ALLOWED_FILTER_KEYS: Array<keyof PromotionPlanFilters> = [
  'advertiser_id',
  'keyword',
  'status',
  'scene',
  'start_date',
  'end_date',
  'page',
  'page_size',
]

const asJsonRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}

const toFiniteNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const normalizeMonitorPlan = (value: unknown): MonitorPlanSnapshot | null => {
  const plan = asJsonRecord(value)
  const id = String(plan.id ?? '').trim()
  if (!id) return null
  const metrics = asJsonRecord(plan.metrics)
  return {
    id,
    name: typeof plan.name === 'string' ? plan.name : undefined,
    budgetYuan: toFiniteNumber(plan.budgetYuan),
    metrics: {
      costYuan: toFiniteNumber(metrics.costYuan),
      payRoi: toFiniteNumber(metrics.payRoi),
    },
  }
}

/** 使用北京时间当天作为指标口径，与千川后台推广监控默认的“今日数据”保持一致。 */
export const getChinaDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

/** 只序列化白名单筛选项，阻断 Renderer 借 IPC 拼接任意服务端查询参数。 */
export const createProductPlanSearch = (filters: PromotionPlanQuery = {}) => {
  const params = new URLSearchParams()
  ALLOWED_FILTER_KEYS.forEach((key) => {
    const value = filters[key]
    if (['string', 'number'].includes(typeof value) && String(value).trim()) params.set(key, String(value).trim())
  })
  return params
}

export const createPromotionPlanService = (client: OAuthServerClient) => {
  const list = async (filters: PromotionPlanQuery = {}) =>
    client.request(`/api/qianchuan/product-plans?${createProductPlanSearch(filters).toString()}`)

  /** 通过固定的 OAuth 服务路由读取单个计划快照，绝不接受任意 URL 或平台参数。 */
  const getDetail = async ({ advertiserId, adId }: PromotionPlanDetailInput) => {
    const search = new URLSearchParams({ advertiser_id: advertiserId, ad_id: adId })
    return client.request(`/api/qianchuan/product-plan-detail?${search.toString()}`)
  }

  /** 调度器按广告主批量读取计划，并在找到所有目标计划后提前停止翻页。 */
  const getAllForMonitor = async (advertiserId: string, promotionPlanIds: string[]): Promise<MonitorPlanSnapshot[]> => {
    const targetIds = new Set(promotionPlanIds)
    const foundPlans = new Map<string, MonitorPlanSnapshot>()
    const today = getChinaDate()
    let page = 1
    let totalPages = 1

    do {
      const result = await list({
        advertiser_id: advertiserId,
        status: 'ALL',
        scene: 'UNI_PROJECT',
        start_date: today,
        end_date: today,
        page,
        page_size: 100,
      })
      const pagePlans = Array.isArray(result.plans) ? result.plans : []
      pagePlans.forEach((value) => {
        const plan = normalizeMonitorPlan(value)
        if (plan && targetIds.has(plan.id)) foundPlans.set(plan.id, plan)
      })
      const pageInfo = asJsonRecord(result.page)
      totalPages = Math.min(1_000, Math.max(1, Number(pageInfo.totalPages) || 1))
      page += 1
    } while (page <= totalPages && foundPlans.size < targetIds.size)

    return [...foundPlans.values()]
  }

  return { list, getDetail, getAllForMonitor }
}

export type PromotionPlanService = ReturnType<typeof createPromotionPlanService>
