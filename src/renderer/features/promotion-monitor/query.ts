import type { PromotionPlanMonitorSelectionInput } from '../../../shared/contracts'

/**
 * 构造监控选计划查询。
 *
 * 监控创建页只表达“当前广告主、当前场景”这两个业务条件；
 * 计划状态、日期范围和分页由主进程 Application 用例统一决定，避免页面与平台口径耦合。
 */
export const buildMonitorPlanSelectionInput = (
  advertiserId: string,
  scene: string = 'UNI_PROJECT',
): PromotionPlanMonitorSelectionInput => ({
  advertiserId: advertiserId.trim() || undefined,
  scene: scene.trim() || undefined,
})
