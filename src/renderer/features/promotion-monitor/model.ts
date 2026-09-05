import type { AdvertiserAccount } from '../../shared/model/qianchuan'

/** 推广监控页面当前使用的分页大小，后续接入服务端分页策略时集中修改。 */
export const PROMOTION_MONITOR_PAGE_SIZE = 20

/** 平台投放状态映射，展示文案与接口枚举保持隔离。 */
export const PROMOTION_STATUS_LABELS: Record<string, string> = {
  ALL: '全部状态',
  DELIVERY_OK: '投放中',
  DISABLE: '已暂停',
  AUDIT: '审核中',
  TIME_DONE: '已完成',
  OFFLINE_BUDGET: '预算不足',
  ALL_INCLUDE_DELETED: '包含已删除',
  FROZEN: '已终止',
  REAUDIT: '修改审核中',
  DELETED: '已删除',
}

export const getAccountName = (accounts: AdvertiserAccount[], id?: string) => {
  const account = accounts.find((item) => String(item.advertiserId) === String(id))
  return account?.advertiserName || account?.shopName || (id ? `广告主 ${id}` : '—')
}

export type PromotionMonitorTab = 'manage' | 'create'

export type PromotionMonitorPageProps = {
  currentAccountId: string
  accounts: AdvertiserAccount[]
}

/** 推广监控筛选条件的默认值，URL 缺少参数时统一从这里恢复。 */
export const DEFAULT_PROMOTION_MONITOR_URL_STATE = {
  accountId: '',
  keyword: '',
  status: 'ALL',
  scene: 'UNI_PROJECT',
  dates: [] as string[],
  page: 1,
  tab: 'manage' as PromotionMonitorTab,
}

export type PromotionMonitorUrlState = typeof DEFAULT_PROMOTION_MONITOR_URL_STATE

/** 将 URL 中的页码解析为安全的正整数，非法值回退到第一页。 */
const parsePage = (value: string | null) => {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : DEFAULT_PROMOTION_MONITOR_URL_STATE.page
}

/** 只接受非空字符串，避免把空参数写进查询状态。 */
const readTextParam = (params: URLSearchParams, key: string) => params.get(key)?.trim() || ''

const PROMOTION_SCENES = new Set(['UNI_PROJECT', 'OVERALL_PROJECT'])
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 只接受页面支持的枚举值，防止损坏的链接让选择器进入无效状态。 */
const readEnumParam = (params: URLSearchParams, key: string, values: Set<string>, fallback: string) => {
  const value = readTextParam(params, key)
  return values.has(value) ? value : fallback
}

/**
 * 从 HashRouter 的查询参数中恢复推广监控状态。
 * 这里只读取界面查询条件，不读取也不允许写入 Token、Secret、Cookie 等敏感信息。
 */
export const parsePromotionMonitorSearchParams = (params: URLSearchParams): PromotionMonitorUrlState => {
  const startDate = readTextParam(params, 'start')
  const endDate = readTextParam(params, 'end')
  const hasValidDateRange = ISO_DATE_PATTERN.test(startDate) && ISO_DATE_PATTERN.test(endDate) && startDate <= endDate
  const tab = params.get('tab') === 'create' ? 'create' : DEFAULT_PROMOTION_MONITOR_URL_STATE.tab

  return {
    accountId: readTextParam(params, 'account'),
    keyword: readTextParam(params, 'keyword'),
    status: readEnumParam(
      params,
      'status',
      new Set(Object.keys(PROMOTION_STATUS_LABELS)),
      DEFAULT_PROMOTION_MONITOR_URL_STATE.status,
    ),
    scene: readEnumParam(params, 'scene', PROMOTION_SCENES, DEFAULT_PROMOTION_MONITOR_URL_STATE.scene),
    dates: hasValidDateRange ? [startDate, endDate] : [],
    page: parsePage(params.get('page')),
    tab,
  }
}

/**
 * 按照当前状态更新推广监控查询参数。
 * 默认值不写入 URL，既能保持链接可读，也能通过解析函数稳定恢复相同状态。
 */
export const updatePromotionMonitorSearchParams = (
  current: URLSearchParams,
  patch: Partial<PromotionMonitorUrlState>,
) => {
  const next = { ...parsePromotionMonitorSearchParams(current), ...patch }
  const params = new URLSearchParams(current)

  const setOrDelete = (key: string, value: string, defaultValue = '') => {
    if (value && value !== defaultValue) params.set(key, value)
    else params.delete(key)
  }

  setOrDelete('account', next.accountId)
  setOrDelete('keyword', next.keyword)
  setOrDelete('status', next.status, DEFAULT_PROMOTION_MONITOR_URL_STATE.status)
  setOrDelete('scene', next.scene, DEFAULT_PROMOTION_MONITOR_URL_STATE.scene)
  setOrDelete('page', String(next.page), String(DEFAULT_PROMOTION_MONITOR_URL_STATE.page))
  setOrDelete('tab', next.tab, DEFAULT_PROMOTION_MONITOR_URL_STATE.tab)

  const [startDate = '', endDate = ''] = next.dates
  setOrDelete('start', startDate)
  setOrDelete('end', endDate)

  return params
}
