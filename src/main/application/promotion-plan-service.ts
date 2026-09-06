/**
 * 商品投放计划应用服务。
 *
 * Electron 主进程直接调用巨量开放平台 API，不再经过 OAuth 服务端代理。
 * Access Token 由 TokenProvider 提供（从 auth-service 获取）。
 *
 * 安全约束：
 * - Access Token 只在主进程内存中，不传给 Renderer；
 * - advertiser_id 必须属于当前 OAuth 授权范围；
 * - 参数校验在客户端完成，防止绕过白名单。
 */
import type { PromotionPlanDetailInput, PromotionPlanFilters } from '../../shared/contracts/promotion-plan'
import type { MonitorPlanSnapshot } from '../monitor-scheduler'
import type { JsonRecord } from '../infrastructure/oauth-server-client'
import type { QianchuanApiClient } from '../infrastructure/qianchuan-api-client'
import {
  buildProductPlanDetailUrl,
  buildProductPlanListUrl,
  normalizeProductPlanResponse,
  parseProductPlanDetailQuery,
  parseProductPlanQuery,
  type ProductPlanQuery,
} from '../infrastructure/qianchuan-domain'

type PromotionPlanQuery = Partial<PromotionPlanFilters>

/** Token 提供者：返回当前有效的 Access Token 和授权广告主列表。 */
export interface TokenProvider {
  getAccessToken: () => string | null
  getAdvertiserIds: () => string[]
}

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

/** 使用北京时间当天作为指标口径。 */
export const getChinaDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

/** 只序列化白名单筛选项，阻断 Renderer 借 IPC 拼接任意查询参数。 */
export const createProductPlanSearch = (filters: PromotionPlanQuery = {}) => {
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
  const params = new URLSearchParams()
  ALLOWED_FILTER_KEYS.forEach((key) => {
    const value = filters[key]
    if (['string', 'number'].includes(typeof value) && String(value).trim()) params.set(key, String(value).trim())
  })
  return params
}

/** 将白名单筛选转换为 Record<string, string> 供 parseProductPlanQuery 消费。 */
const filtersToParams = (filters: PromotionPlanQuery): Record<string, string | undefined> => {
  const params: Record<string, string | undefined> = {}
  const search = createProductPlanSearch(filters)
  for (const [key, value] of search.entries()) {
    params[key] = value
  }
  return params
}

export interface PromotionPlanServiceDeps {
  apiClient: QianchuanApiClient
  tokenProvider: TokenProvider
}

export const createPromotionPlanService = ({ apiClient, tokenProvider }: PromotionPlanServiceDeps) => {
  const list = async (filters: PromotionPlanQuery = {}) => {
    const accessToken = tokenProvider.getAccessToken()
    if (!accessToken) throw new Error('当前未登录，请先完成巨量千川授权。')

    const advertiserIds = tokenProvider.getAdvertiserIds()
    const query = parseProductPlanQuery(filtersToParams(filters), advertiserIds)
    const url = buildProductPlanListUrl(query)
    const payload = await apiClient.request(url, accessToken, '获取商品投放计划')
    return normalizeProductPlanResponse(payload as Record<string, unknown>, query)
  }

  const getDetail = async ({ advertiserId, adId }: PromotionPlanDetailInput) => {
    const accessToken = tokenProvider.getAccessToken()
    if (!accessToken) throw new Error('当前未登录，请先完成巨量千川授权。')

    const advertiserIds = tokenProvider.getAdvertiserIds()
    const query = parseProductPlanDetailQuery(advertiserId, adId, advertiserIds)
    const url = buildProductPlanDetailUrl(query)
    const payload = await apiClient.request(url, accessToken, '获取计划详情')
    return payload
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
      pagePlans.forEach((value: unknown) => {
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
