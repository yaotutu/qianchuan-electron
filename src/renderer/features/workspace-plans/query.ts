import type { PromotionPlanListInput } from '../../../shared/contracts'
import type { WorkspacePlanScene } from './useWorkspacePlans'

/**
 * 构造普通工作台计划查询。
 *
 * 页面只提供广告主和场景；普通列表的“有效计划 + 当天数据 + 首页 100 条”
 * 是工作台稳定的业务口径，集中在纯函数中便于测试和后续拆分历史查询。
 */
export const buildWorkspacePlanQuery = (
  advertiserId: string,
  scene: WorkspacePlanScene,
  date: string,
): PromotionPlanListInput => ({
  advertiserId: advertiserId.trim() || undefined,
  keyword: '',
  status: 'ALL',
  scene,
  dateRange: { startDate: date, endDate: date },
  page: 1,
  pageSize: 100,
})
