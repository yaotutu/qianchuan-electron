import { z } from 'zod'

/**
 * 当前只允许把已核实的专项增量写接口纳入提交准备层。
 * 名称、投放时间和计划状态等能力即使在 UI 中有草稿字段，也不能凭网页内部接口生成正式命令。
 */
export const promotionPlanWriteOperationSchema = z.enum(['UPDATE_BUDGET', 'UPDATE_ROI'])

const positiveMoney = z
  .number()
  .finite()
  .positive()
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, '数值最多保留两位小数')

export const updateBudgetInfoSchema = z
  .object({
    ad_id: z.number().int().positive(),
    budget: positiveMoney,
    min_estimate_convert: z.number().finite().positive().optional(),
    estimate_convert: z.number().finite().positive().optional(),
    estimate_roi_goal: z.number().finite().positive().optional(),
    min_estimate_roi_goal: z.number().finite().positive().optional(),
  })
  .strip()

export const updateBudgetPayloadSchema = z
  .object({
    advertiser_id: z.number().int().positive(),
    update_budget_infos: z.array(updateBudgetInfoSchema).min(1).max(10),
  })
  .strip()

export const updateRoiInfoSchema = z
  .object({
    ad_id: z.number().int().positive(),
    roi2_goal: positiveMoney,
    deep_external_action: z.enum(['AD_CONVERT_TYPE_LIVE_PAY_ROI', 'AD_CONVERT_TYPE_LIVE_PURE_PAY_ROI']).optional(),
  })
  .strip()

export const updateRoiPayloadSchema = z
  .object({
    advertiser_id: z.number().int().positive(),
    update_roi2_infos: z.array(updateRoiInfoSchema).min(1).max(10),
  })
  .strip()

export const promotionPlanWriteCommandSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('UPDATE_BUDGET'),
    endpoint: z.literal('/open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/'),
    changedFields: z.array(z.literal('budgetYuan')).min(1),
    payload: updateBudgetPayloadSchema,
  }),
  z.object({
    operation: z.literal('UPDATE_ROI'),
    endpoint: z.literal('/open_api/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/'),
    changedFields: z.array(z.literal('roiGoal')).min(1),
    payload: updateRoiPayloadSchema,
  }),
])

export const promotionPlanWritePreflightSchema = z
  .object({
    valid: z.boolean(),
    hasSupportedChanges: z.boolean(),
    requiresUserConfirmation: z.boolean(),
    commands: z.array(promotionPlanWriteCommandSchema),
    unsupportedFields: z.array(z.string()),
    blockingReasons: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strip()

export type PromotionPlanWriteOperation = z.infer<typeof promotionPlanWriteOperationSchema>
export type UpdateBudgetPayload = z.infer<typeof updateBudgetPayloadSchema>
export type UpdateRoiPayload = z.infer<typeof updateRoiPayloadSchema>
export type PromotionPlanWriteCommand = z.infer<typeof promotionPlanWriteCommandSchema>
export type PromotionPlanWritePreflight = z.infer<typeof promotionPlanWritePreflightSchema>
