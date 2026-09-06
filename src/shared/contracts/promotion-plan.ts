import { z } from 'zod'

export type PromotionPlanFilters = {
  advertiser_id: string
  keyword: string
  status: string
  scene: string
  start_date: string
  end_date: string
  page: number
  page_size: number
}

const ipcQueryText = z.string().max(500)

/** 计划查询 IPC 的白名单字段，只允许页面传递已声明的筛选条件。 */
export const promotionPlanFiltersSchema = z
  .object({
    advertiser_id: z.string().max(128).optional(),
    keyword: ipcQueryText.optional(),
    status: z.string().max(128).optional(),
    scene: z.string().max(128).optional(),
    start_date: z.string().max(32).optional(),
    end_date: z.string().max(32).optional(),
    page: z.number().int().min(1).max(10_000).optional(),
    page_size: z.number().int().min(1).max(100).optional(),
  })
  .strip()

export const productSchema = z
  .object({
    name: z.string().optional(),
    image: z.string().optional(),
  })
  .passthrough()

export const promotionPlanSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    advertiserId: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => (value === undefined ? undefined : String(value))),
    name: z.string().optional(),
    status: z.string().optional(),
    createTime: z.string().optional(),
    products: z.array(productSchema).optional(),
    metrics: z
      .object({
        costYuan: z.union([z.number(), z.string()]).optional(),
        payRoi: z.union([z.number(), z.string()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

/** Renderer 仅解析页面依赖字段，平台或服务端新增字段会被原样保留。 */
export const promotionPlanResultSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional(),
    message: z.string().optional(),
    platformCode: z.union([z.string(), z.number()]).nullable().optional(),
    advertiserId: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => (value === undefined ? undefined : String(value))),
    plans: z.array(promotionPlanSchema).optional().default([]),
    page: z
      .object({
        current: z.union([z.number(), z.string()]).optional(),
        total: z.union([z.number(), z.string()]).optional(),
        totalPages: z.union([z.number(), z.string()]).optional(),
      })
      .passthrough()
      .optional(),
    query: z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export type PromotionPlan = z.infer<typeof promotionPlanSchema>
export type PromotionPlanResult = z.infer<typeof promotionPlanResultSchema>

/** 详情查询只接受广告主 ID 与计划 ID，均由 IPC 边界再次校验。 */
export const promotionPlanDetailInputSchema = z
  .object({
    advertiserId: z.string().trim().min(1).max(128),
    adId: z
      .string()
      .trim()
      .regex(/^\d{1,30}$/u, '计划 ID 格式无效'),
  })
  .strip()

const optionalText = z.string().optional()
const optionalNumber = z.number().finite().optional()
const optionalBoolean = z.boolean().optional()

const promotionPlanIdentitySchema = z
  .object({
    advertiserId: z.union([z.string(), z.number()]).transform(String),
    adId: z.union([z.string(), z.number()]).transform(String),
    awemeId: optionalText,
    name: optionalText,
    marketingGoal: optionalText,
    scene: optionalText,
    status: optionalText,
    optStatus: optionalText,
    createTime: optionalText,
    modifyTime: optionalText,
    shopId: optionalText,
  })
  .strip()

const promotionPlanDeliverySchema = z
  .object({
    externalAction: optionalText,
    smartBidType: optionalText,
    deepExternalAction: optionalText,
    deepBidType: optionalText,
    pricingType: optionalText,
    roiGoal: optionalNumber,
    budgetMode: optionalText,
    budgetYuan: optionalNumber,
    dailyDeliveryHours: optionalNumber,
    scheduleType: optionalText,
    startTime: optionalText,
    endTime: optionalText,
  })
  .strip()

const promotionPlanProductDetailSchema = z
  .object({
    productId: z.union([z.string(), z.number()]).transform(String),
    channelType: optionalText,
    channelId: optionalText,
  })
  .strip()

const promotionPlanAccountSchema = z
  .object({
    awemeUid: z.union([z.string(), z.number()]).transform(String),
    awemeName: optionalText,
    uniqueId: optionalText,
  })
  .strip()

const promotionPlanRoomSchema = z
  .object({
    anchorId: z.union([z.string(), z.number()]).transform(String),
    anchorName: optionalText,
    anchorAvatar: optionalText,
  })
  .strip()

const promotionPlanCreativeSchema = z
  .object({
    smartSelectMaterial: optionalBoolean,
    hideInAweme: optionalBoolean,
    enableAigcCreative: optionalBoolean,
    liveRoomViewEnabled: optionalBoolean,
    selfSelectedVideoEnabled: optionalBoolean,
    selectedStarProductIds: z.array(z.union([z.string(), z.number()]).transform(String)),
    videoCount: z.number().int().min(0),
    imageCount: z.number().int().min(0),
    titleCount: z.number().int().min(0),
    carouselCount: z.number().int().min(0),
    blockedMaterialCount: z.number().int().min(0),
    titles: z.array(z.string()).max(50),
  })
  .strip()

const promotionPlanAdvancedSchema = z
  .object({
    qcpxMode: optionalText,
    starTaskMaterialSwitch: optionalText,
    overallRoiCostItems: z.array(z.number().finite()),
    allianceCommissionSwitch: optionalText,
    isMultiAwemeUid: optionalBoolean,
    noAwemeId: optionalBoolean,
    autoAwemeMaterial: optionalBoolean,
  })
  .strip()

const promotionPlanCapabilitiesSchema = z
  .object({
    canEnable: z.boolean(),
    canDisable: z.boolean(),
    canDelete: z.boolean(),
    canUpdateBudget: z.boolean(),
    canUpdateRoi: z.boolean(),
    canUpdateName: z.boolean(),
    canUpdateSchedule: z.boolean(),
    canUpdateFullConfig: z.boolean(),
    reasons: z.array(z.string()),
  })
  .strip()

/**
 * 版本化配置快照契约。这里明确枚举可展示字段并 strip 未知字段，避免 OAuth 服务
 * 或平台响应升级后把未经审核的敏感字段意外带入 Renderer。
 */
export const promotionPlanDetailSnapshotSchema = z
  .object({
    snapshotId: z.string(),
    fetchedAt: z.string(),
    source: z.literal('OCEANENGINE_OPEN_API'),
    version: z.literal(1),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/u),
    identity: promotionPlanIdentitySchema,
    delivery: promotionPlanDeliverySchema,
    products: z.array(promotionPlanProductDetailSchema),
    accounts: z.array(promotionPlanAccountSchema),
    rooms: z.array(promotionPlanRoomSchema),
    creative: promotionPlanCreativeSchema,
    advanced: promotionPlanAdvancedSchema,
    capabilities: promotionPlanCapabilitiesSchema,
  })
  .strip()

export const promotionPlanDetailResultSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional(),
    message: z.string().optional(),
    platformCode: z.union([z.string(), z.number()]).nullable().optional(),
    requestId: z.string().optional(),
    snapshot: promotionPlanDetailSnapshotSchema.optional(),
  })
  .strip()

export type PromotionPlanDetailInput = z.infer<typeof promotionPlanDetailInputSchema>
export type PromotionPlanDetailSnapshot = z.infer<typeof promotionPlanDetailSnapshotSchema>
export type PromotionPlanDetailResult = z.infer<typeof promotionPlanDetailResultSchema>

/**
 * 计划修改草稿只描述本地拟修改的字段，不代表已经向千川提交。
 * baseSnapshotId 与 baseContentHash 用来做并发基线，真正接入写接口时必须先重新读取详情并比对。
 */
export const promotionPlanEditChangesSchema = z
  .object({
    name: z.string().max(200).optional(),
    budgetYuan: z.number().finite().optional(),
    roiGoal: z.number().finite().optional(),
    startTime: z.string().max(64).optional(),
    endTime: z.string().max(64).optional(),
  })
  .strip()

export const promotionPlanEditDraftSchema = z
  .object({
    advertiserId: z.string().trim().min(1).max(128),
    adId: z
      .string()
      .trim()
      .regex(/^\d{1,30}$/u, '计划 ID 格式无效'),
    baseSnapshotId: z.string().trim().min(1).max(256),
    baseContentHash: z.string().regex(/^[0-9a-f]{64}$/u, '快照内容摘要格式无效'),
    changes: promotionPlanEditChangesSchema,
  })
  .strip()

const promotionPlanEditableFieldSchema = z.enum(['name', 'budgetYuan', 'roiGoal', 'startTime', 'endTime'])

export const promotionPlanFieldChangeSchema = z
  .object({
    field: promotionPlanEditableFieldSchema,
    label: z.string(),
    before: z.union([z.string(), z.number()]).optional(),
    after: z.union([z.string(), z.number()]),
    allowed: z.boolean(),
    reason: z.string().optional(),
  })
  .strip()

export const promotionPlanChangePreviewSchema = z
  .object({
    valid: z.boolean(),
    hasChanges: z.boolean(),
    changes: z.array(promotionPlanFieldChangeSchema),
    blockingReasons: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strip()

export type PromotionPlanEditChanges = z.infer<typeof promotionPlanEditChangesSchema>
export type PromotionPlanEditDraft = z.infer<typeof promotionPlanEditDraftSchema>
export type PromotionPlanEditableField = z.infer<typeof promotionPlanEditableFieldSchema>
export type PromotionPlanFieldChange = z.infer<typeof promotionPlanFieldChangeSchema>
export type PromotionPlanChangePreview = z.infer<typeof promotionPlanChangePreviewSchema>
