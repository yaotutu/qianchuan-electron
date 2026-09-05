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
