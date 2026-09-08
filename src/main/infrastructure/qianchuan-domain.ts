/**
 * 千川商品投放计划查询的纯函数集合。
 *
 * 从服务端 domain/product-plans.ts 迁移而来。
 * 负责校验查询参数、构造巨量接口 URL、把平台响应裁剪成页面所需的最小数据模型。
 *
 * Access Token 的获取由调用方负责，本模块不接触 Token。
 */

import { createHash } from 'node:crypto'

import type {
  PromotionPlanLegacyDetailResult,
  PromotionPlanDetailSnapshot,
} from '../../shared/contracts/promotion-plan'

// ─── 常量 ──────────────────────────────────────────────────

export const PRODUCT_PLAN_FIELDS = Object.freeze([
  'stat_cost',
  'total_prepay_and_pay_order_roi2',
  'total_pay_order_gmv_for_roi2',
  'total_pay_order_count_for_roi2',
  'total_cost_per_pay_order_for_roi2',
  'total_order_settle_count_for_roi2_1h',
  'total_order_settle_amount_for_roi2_1h',
])

export const PRODUCT_PLAN_STATUSES = Object.freeze([
  'ALL',
  'ALL_INCLUDE_DELETED',
  'AUDIT',
  'DELETED',
  'DELIVERY_OK',
  'DISABLE',
  'EXTERNAL_URL_DISABLE',
  'FROZEN',
  'LIVE_ROOM_OFF',
  'NO_SCHEDULE',
  'OFFLINE_AUDIT',
  'OFFLINE_BALANCE',
  'OFFLINE_BUDGET',
  'QUOTA_DISABLE',
  'REAUDIT',
  'ROI2_DISABLE',
  'SYSTEM_DISABLE',
  'TIME_DONE',
  'TIME_NO_REACH',
  'ADVERTISER_OFFLINE_BUDGET',
])

export const PRODUCT_PLAN_SCENES = Object.freeze(['UNI_PROJECT', 'OVERALL_PROJECT'])

/** 千川商品投放计划列表接口地址（开放平台固定地址）。 */
export const PRODUCT_PLAN_LIST_URL = 'https://api.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/list/'

/** 千川商品投放计划详情接口地址。 */
export const PRODUCT_PLAN_DETAIL_URL = 'https://api.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/ad/detail/'

const PAGE_SIZES = Object.freeze([10, 20, 50, 100])
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const PLAN_ID_PATTERN = /^\d{1,30}$/u

// ─── 日期工具 ───────────────────────────────────────────────

/** 按北京时间输出 YYYY-MM-DD，避免时区偏移。 */
export const toChinaDate = (timestamp: number): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))

/** 验证日期既符合格式也确实存在。 */
const parseDate = (value: string, fieldName: string): number => {
  if (!DATE_PATTERN.test(value)) throw new Error(`${fieldName} 必须使用 YYYY-MM-DD 格式。`)
  const [year, month, day] = value.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${fieldName} 不是有效日期。`)
  }
  return timestamp
}

// ─── 数值工具 ───────────────────────────────────────────────

const toPositiveInteger = (value: string | null, fallback: number): number => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('分页参数必须是正整数。')
  return parsed
}

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const normalizeAdvertiserIds = (values: unknown): string[] =>
  (Array.isArray(values) ? values : []).map((value) => String(value ?? '').trim()).filter(Boolean)

// ─── 列表查询 ───────────────────────────────────────────────

export interface ProductPlanQuery {
  advertiserId: string
  page: number
  pageSize: number
  status: string
  scene: string
  keyword: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  marketingGoal: string
}

/**
 * 校验查询参数并构造内部查询模型。
 * advertiser_id 必须属于当前 OAuth 授权范围。
 */
export const parseProductPlanQuery = (
  params: Record<string, string | undefined>,
  authorizedAdvertiserIds: string[],
  now: () => number = Date.now,
): ProductPlanQuery => {
  const advertiserIds = normalizeAdvertiserIds(authorizedAdvertiserIds)
  if (advertiserIds.length === 0) {
    throw new Error('当前授权没有可用的广告主账号，请重新授权并勾选店铺。')
  }

  const requestedAdvertiserId = String(params.advertiser_id ?? '').trim()
  const advertiserId = requestedAdvertiserId || advertiserIds[0]!
  if (!advertiserIds.includes(advertiserId)) {
    throw new Error('无权查询该广告主账号。')
  }

  const page = toPositiveInteger(params.page ?? null, 1)
  const pageSize = toPositiveInteger(params.page_size ?? null, 20)
  if (!PAGE_SIZES.includes(pageSize)) throw new Error('page_size 只允许 10、20、50 或 100。')

  const status = String(params.status ?? 'ALL')
    .trim()
    .toUpperCase()
  if (!PRODUCT_PLAN_STATUSES.includes(status)) throw new Error('投放状态参数不受支持。')

  const scene = String(params.scene ?? 'UNI_PROJECT')
    .trim()
    .toUpperCase()
  if (!PRODUCT_PLAN_SCENES.includes(scene)) throw new Error('计划类型参数不受支持。')

  const keyword = String(params.keyword ?? '').trim()
  if (keyword.length > 100) throw new Error('商品搜索关键词不能超过 100 个字符。')

  // 默认查询近 30 个自然日
  const defaultEndDate = toChinaDate(now())
  const defaultStartDate = toChinaDate(now() - 29 * DAY_MS)
  const startDate = String(params.start_date ?? defaultStartDate)
  const endDate = String(params.end_date ?? defaultEndDate)
  const startTimestamp = parseDate(startDate, 'start_date')
  const endTimestamp = parseDate(endDate, 'end_date')

  if (endTimestamp < startTimestamp) throw new Error('end_date 不能早于 start_date。')
  if (endTimestamp - startTimestamp > 180 * DAY_MS) {
    throw new Error('计划数据查询区间不能超过 180 天。')
  }

  return Object.freeze({
    advertiserId,
    page,
    pageSize,
    status,
    scene,
    keyword,
    startDate,
    endDate,
    startTime: `${startDate} 00:00:00`,
    endTime: `${endDate} 23:59:59`,
    marketingGoal: 'VIDEO_PROM_GOODS',
  })
}

/** 按官方 SDK 规则构造列表请求 URL。 */
export const buildProductPlanListUrl = (query: ProductPlanQuery): string => {
  const url = new URL(PRODUCT_PLAN_LIST_URL)
  const filtering: Record<string, string> = { status: query.status }
  if (query.keyword) {
    filtering.search_keyword = query.keyword
    filtering.search_keyword_type = 'PRODUCT'
  }

  url.searchParams.set('advertiser_id', query.advertiserId)
  url.searchParams.set('start_time', query.startTime)
  url.searchParams.set('end_time', query.endTime)
  url.searchParams.set('marketing_goal', query.marketingGoal)
  url.searchParams.set('fields', JSON.stringify([...PRODUCT_PLAN_FIELDS]))
  url.searchParams.set('filtering', JSON.stringify(filtering))
  url.searchParams.set('order_field', 'create_time')
  url.searchParams.set('order_type', 'DESC')
  url.searchParams.set('page', String(query.page))
  url.searchParams.set('page_size', String(query.pageSize))
  url.searchParams.set('adlab_scene', query.scene)
  return url.toString()
}

// ─── 列表响应标准化 ─────────────────────────────────────────

const normalizeProduct = (product: Record<string, unknown> = {}) => ({
  id: String(product.product_id ?? ''),
  name: String(product.product_name ?? ''),
  image: String(product.product_image ?? ''),
  recommendReasons: Array.isArray(product.recommend_reasons) ? (product.recommend_reasons as string[]).map(String) : [],
})

const normalizePlan = (item: Record<string, unknown> = {}) => {
  const info = (item.ad_info ?? {}) as Record<string, unknown>
  const stats = (item.stats_info ?? {}) as Record<string, unknown>
  return {
    id: String(info.id ?? ''),
    name: String(info.name ?? ''),
    status: String(info.status ?? ''),
    optStatus: String(info.opt_status ?? ''),
    createTime: String(info.create_time ?? ''),
    startTime: String(info.start_time ?? ''),
    endTime: String(info.end_time ?? ''),
    marketingGoal: String(info.marketing_goal ?? ''),
    scene: String(info.adlab_scene ?? ''),
    smartBidType: String(info.smart_bid_type ?? ''),
    budgetMode: String(info.budget_mode ?? ''),
    budgetYuan: toFiniteNumber(info.budget),
    roiGoal: toFiniteNumber(info.roi2_goal),
    products: Array.isArray(item.product_info)
      ? (item.product_info as Record<string, unknown>[]).map(normalizeProduct)
      : [],
    metrics: {
      // stat_cost 单位为千分之一分，换算成人民币元需除以 100000。
      costYuan: toFiniteNumber(stats.stat_cost) / 100000,
      payRoi: toFiniteNumber(stats.total_prepay_and_pay_order_roi2),
      payGmvYuan: toFiniteNumber(stats.total_pay_order_gmv_for_roi2),
      payOrderCount: toFiniteNumber(stats.total_pay_order_count_for_roi2),
      costPerPayOrderYuan: toFiniteNumber(stats.total_cost_per_pay_order_for_roi2),
    },
  }
}

/** 把平台响应裁剪为页面模型。 */
export const normalizeProductPlanResponse = (payload: Record<string, unknown>, query: ProductPlanQuery) => {
  const data = (payload?.data ?? {}) as Record<string, unknown>
  const pageInfo = (data.page_info ?? {}) as Record<string, unknown>
  return {
    ok: true as const,
    advertiserId: query.advertiserId,
    query: {
      marketingGoal: query.marketingGoal,
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      scene: query.scene,
      keyword: query.keyword,
    },
    plans: Array.isArray(data.ad_list)
      ? (data.ad_list as Record<string, unknown>[]).map((item) => ({
          ...normalizePlan(item),
          advertiserId: query.advertiserId,
        }))
      : [],
    page: {
      current: toFiniteNumber(pageInfo.page, query.page),
      size: toFiniteNumber(pageInfo.page_size, query.pageSize),
      totalPages: toFiniteNumber(pageInfo.total_page),
      total: toFiniteNumber(pageInfo.total_num),
    },
    requestId: String(payload?.request_id ?? ''),
  }
}

// ─── 详情查询 ───────────────────────────────────────────────

export interface ProductPlanDetailQuery {
  advertiserId: string
  adId: string
}

/** 校验详情查询参数。 */
export const parseProductPlanDetailQuery = (
  advertiserId: string,
  adId: string,
  authorizedAdvertiserIds: string[],
): ProductPlanDetailQuery => {
  const advertiserIds = normalizeAdvertiserIds(authorizedAdvertiserIds)
  if (advertiserIds.length === 0) {
    throw new Error('当前授权没有可用的广告主账号，请重新授权并勾选店铺。')
  }
  if (!advertiserId) throw new Error('advertiser_id 不能为空。')
  if (!advertiserIds.includes(advertiserId)) throw new Error('无权查询该广告主账号。')
  if (!PLAN_ID_PATTERN.test(adId)) throw new Error('ad_id 必须是有效的数字计划 ID。')
  return Object.freeze({ advertiserId, adId })
}

/** 构造详情请求 URL。 */
export const buildProductPlanDetailUrl = (query: ProductPlanDetailQuery): string => {
  const url = new URL(PRODUCT_PLAN_DETAIL_URL)
  url.searchParams.set('advertiser_id', query.advertiserId)
  url.searchParams.set('ad_id', query.adId)
  return url.toString()
}

// ─── 详情响应标准化 ─────────────────────────────────────────

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}

const asArray = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(asRecord) : [])

const textOrUndefined = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  return String(value)
}

const finiteOrUndefined = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const booleanOrUndefined = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

/** 对对象键排序后序列化，保证平台字段顺序变化不会导致同一业务配置产生不同摘要。 */
const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as JsonRecord)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize((value as JsonRecord)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

const calculateContentHash = (content: unknown) => createHash('sha256').update(stableSerialize(content)).digest('hex')

const normalizeCreative = (data: JsonRecord, delivery: JsonRecord): PromotionPlanDetailSnapshot['creative'] => {
  const creativeSetting = asRecord(data.creative_setting)
  const multiCreative = asArray(data.multi_product_creative_list)
  const programmatic = asArray(data.programmatic_creative_media_list)
  const allCreative = [...multiCreative, ...programmatic]
  const videos = allCreative.flatMap((item) => asArray(item.video_material))
  const images = allCreative.flatMap((item) => asArray(item.image_material))
  const titles = allCreative.flatMap((item) => asArray(item.title_material))
  const carousels = allCreative.flatMap((item) => asArray(item.carousel_material))
  const blocked = allCreative.flatMap((item) => asArray(item.block_material))
  const selectedStarProductIds = allCreative
    .map((item) => item.product_id)
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(String)

  return {
    smartSelectMaterial: booleanOrUndefined(delivery.smart_select_material ?? creativeSetting.smart_select_material),
    hideInAweme: booleanOrUndefined(creativeSetting.hide_in_aweme),
    enableAigcCreative: booleanOrUndefined(delivery.enable_aigc_creative),
    liveRoomViewEnabled: booleanOrUndefined(delivery.live_room_view_enabled),
    selfSelectedVideoEnabled: booleanOrUndefined(delivery.self_selected_video_enabled),
    selectedStarProductIds: [...new Set(selectedStarProductIds)],
    videoCount: videos.length,
    imageCount: images.length,
    titleCount: titles.length,
    carouselCount: carousels.length,
    blockedMaterialCount: blocked.length,
    titles: titles
      .map((item) => textOrUndefined(item.title))
      .filter((value): value is string => Boolean(value))
      .slice(0, 50),
  }
}

/**
 * 把巨量详情原始响应裁剪为稳定、可审计的业务快照。
 * 详情接口可能返回超大 ID 和大量素材元数据，必须在主进程完成字符串化、聚合和白名单裁剪，
 * Renderer 只接收快照，不接触平台原始响应，也不把未知字段意外带入页面。
 */
export const normalizeProductPlanDetailResponse = (
  payload: JsonRecord,
  advertiserId: string,
  fetchedAt: string,
): PromotionPlanLegacyDetailResult => {
  const data = asRecord(payload.data)
  const delivery = asRecord(data.delivery_setting)
  const products = asArray(data.product_infos).map((item) => ({
    productId: String(item.product_id ?? ''),
    channelType: textOrUndefined(item.channel_type),
    channelId: textOrUndefined(item.channel_id),
  }))
  const accounts = asArray(data.aweme_infos).map((item) => ({
    awemeUid: String(item.aweme_uid ?? ''),
    awemeName: textOrUndefined(item.aweme_name),
    uniqueId: textOrUndefined(item.unique_id),
  }))
  const rooms = asArray(data.room_info).map((item) => ({
    anchorId: String(item.anchor_id ?? ''),
    anchorName: textOrUndefined(item.anchor_name),
    anchorAvatar: textOrUndefined(item.anchor_avatar),
  }))
  const creative = normalizeCreative(data, delivery)
  const identity = {
    advertiserId: String(advertiserId),
    adId: String(data.ad_id ?? ''),
    awemeId: textOrUndefined(data.aweme_id),
    name: textOrUndefined(data.name),
    marketingGoal: textOrUndefined(data.marketing_goal),
    scene: textOrUndefined(data.adlab_scene),
    status: textOrUndefined(data.status),
    optStatus: textOrUndefined(data.opt_status),
    createTime: textOrUndefined(data.create_time),
    modifyTime: textOrUndefined(data.modify_time),
    shopId: textOrUndefined(data.shop_id),
  }
  const normalizedDelivery = {
    externalAction: textOrUndefined(delivery.external_action),
    smartBidType: textOrUndefined(delivery.smart_bid_type),
    deepExternalAction: textOrUndefined(delivery.deep_external_action),
    deepBidType: textOrUndefined(delivery.deep_bid_type),
    pricingType: textOrUndefined(delivery.pricing_type),
    roiGoal: finiteOrUndefined(delivery.roi2_goal),
    budgetMode: textOrUndefined(delivery.budget_mode),
    // 千川详情预算以元返回；这里保留平台原始数值，不做二次换算。
    budgetYuan: finiteOrUndefined(delivery.budget),
    dailyDeliveryHours: finiteOrUndefined(delivery.daily_delivery_hours),
    scheduleType: textOrUndefined(delivery.video_schedule_type),
    startTime: textOrUndefined(delivery.start_time),
    endTime: textOrUndefined(delivery.end_time),
  }
  const advanced = {
    qcpxMode: textOrUndefined(delivery.qcpx_mode),
    starTaskMaterialSwitch: textOrUndefined(delivery.star_task_material_switch),
    overallRoiCostItems: Array.isArray(delivery.overall_roi_cost_items)
      ? delivery.overall_roi_cost_items.map(Number).filter(Number.isFinite)
      : [],
    allianceCommissionSwitch: textOrUndefined(
      delivery.alliance_commision_switch ?? delivery.alliance_commission_switch,
    ),
    isMultiAwemeUid: booleanOrUndefined(delivery.is_multi_aweme_uid),
    noAwemeId: booleanOrUndefined(delivery.no_aweme_id),
    autoAwemeMaterial: booleanOrUndefined(delivery.auto_aweme_material),
  }
  const capabilityReasons: string[] = []
  const isDeleted = identity.status === 'DELETED'
  const normalizedBudgetMode = (normalizedDelivery.budgetMode ?? '').trim().toUpperCase()
  const isRecommendedBudget = /RECOMMEND|SUGGEST|建议/u.test(normalizedBudgetMode)
  const canUpdateBudget =
    !isDeleted && !isRecommendedBudget && Boolean(identity.adId && normalizedDelivery.budgetYuan !== undefined)
  const canUpdateRoi = !isDeleted && Boolean(identity.adId && normalizedDelivery.roiGoal !== undefined)
  if (isDeleted) capabilityReasons.push('已删除计划不能执行修改。')
  if (isRecommendedBudget) capabilityReasons.push('建议预算模式需要额外保障参数，当前客户端不提交预算修改。')
  else if (!canUpdateBudget) capabilityReasons.push('详情未返回可安全修改的预算配置。')
  if (!canUpdateRoi) capabilityReasons.push('详情未返回可安全修改的 ROI 配置。')
  const capabilities = {
    canEnable: !isDeleted,
    canDisable: !isDeleted,
    canDelete: !isDeleted,
    canUpdateBudget,
    canUpdateRoi,
    // 名称和时间的正式写接口尚未纳入本轮安全白名单。
    canUpdateName: false,
    canUpdateSchedule: false,
    canUpdateFullConfig: false,
    reasons: capabilityReasons,
  }
  const content = {
    identity,
    delivery: normalizedDelivery,
    products,
    accounts,
    rooms,
    creative,
    advanced,
    capabilities,
  }
  const contentHash = calculateContentHash(content)
  const snapshot: PromotionPlanDetailSnapshot = {
    snapshotId: `${identity.adId}:${fetchedAt}:${contentHash.slice(0, 12)}`,
    fetchedAt,
    source: 'OCEANENGINE_OPEN_API',
    version: 1,
    contentHash,
    identity,
    delivery: normalizedDelivery,
    products,
    accounts,
    rooms,
    creative,
    advanced,
    capabilities,
  }
  return {
    ok: Number(payload.code) === 0,
    status: Number(payload.code) === 0 ? 'ready' : 'error',
    message: textOrUndefined(payload.message),
    platformCode: (payload.code as string | number | null | undefined) ?? null,
    requestId: textOrUndefined(payload.request_id),
    snapshot,
  }
}
