import type {
  PromotionPlanDetailInput,
  PromotionPlanListInput,
  PromotionPlanMonitorSelectionInput,
} from '../../shared/contracts'

/**
 * 计划查询的稳定 Query Key 工厂。
 *
 * Query Key 必须完整覆盖会影响平台结果的业务输入，不能只放广告主 ID 或场景，
 * 否则用户切换日期、状态、关键词或分页时，TanStack Query 可能复用旧缓存。
 * 这里先把可选输入归一化为稳定的纯数据对象，再交给 Query Client 做缓存隔离。
 */
export const promotionPlanQueryKeys = {
  all: ['promotion-plan'] as const,
  list: (input: PromotionPlanListInput) =>
    [
      'promotion-plan',
      'list',
      {
        advertiserId: input.advertiserId?.trim() || '',
        keyword: input.keyword?.trim() || '',
        status: input.status?.trim() || '',
        scene: input.scene?.trim() || '',
        startDate: input.dateRange?.startDate?.trim() || '',
        endDate: input.dateRange?.endDate?.trim() || '',
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 20,
      },
    ] as const,
  monitorSelection: (input: PromotionPlanMonitorSelectionInput) =>
    [
      'promotion-plan',
      'monitor-selection',
      {
        advertiserId: input.advertiserId?.trim() || '',
        scene: input.scene?.trim() || '',
      },
    ] as const,
  detail: (input: PromotionPlanDetailInput) =>
    ['promotion-plan', 'detail', input.advertiserId.trim(), input.adId.trim()] as const,
}
