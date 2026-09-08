import { z } from 'zod'

import { resultSchema, type Result } from './result'

const ipcQueryText = z.string().max(500)

/**
 * Renderer 到主进程的计划列表输入。
 *
 * 这里故意使用业务语义命名，不把巨量 OpenAPI 的 snake_case 字段泄露到页面、
 * preload 或 IPC。平台字段转换只允许发生在主进程基础设施适配器边界。
 */
export const promotionPlanListInputSchema = z
  .object({
    advertiserId: z.string().trim().max(128).optional(),
    keyword: ipcQueryText.optional(),
    status: z.string().max(128).optional(),
    scene: z.string().max(128).optional(),
    dateRange: z
      .object({
        startDate: z.string().max(32).optional(),
        endDate: z.string().max(32).optional(),
      })
      .strip()
      .optional(),
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
  })
  .strip()

export type PromotionPlanListInput = z.infer<typeof promotionPlanListInputSchema>

/**
 * 监控创建页的专用查询输入。
 *
 * 监控选计划与普通工作台列表虽然复用同一平台读取能力，但查询口径不同：
 * 监控需要一次读取足够多的候选计划，且不应该继承工作台的日期筛选。
 * 单独建模后，Renderer 不再通过 status、pageSize 等底层参数“暗示”业务语义。
 */
export const promotionPlanMonitorSelectionInputSchema = z
  .object({
    advertiserId: z.string().trim().max(128).optional(),
    scene: z.string().max(128).optional(),
  })
  .strip()

export type PromotionPlanMonitorSelectionInput = z.infer<typeof promotionPlanMonitorSelectionInputSchema>

/** 商品列表只保留页面需要的稳定字段，未知平台字段在此边界被裁剪。 */
export const productSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    image: z.string().optional(),
    recommendReasons: z.array(z.string()).optional(),
  })
  .strip()

/**
 * 计划列表的白名单模型。
 * 应用层和 Renderer 都只使用这些 camelCase 字段，避免平台响应对象意外透传。
 */
export const promotionPlanSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    advertiserId: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => (value === undefined ? undefined : String(value))),
    name: z.string().optional(),
    status: z.string().optional(),
    optStatus: z.string().optional(),
    createTime: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    marketingGoal: z.string().optional(),
    scene: z.string().optional(),
    smartBidType: z.string().optional(),
    budgetMode: z.string().optional(),
    budgetYuan: z.union([z.number(), z.string()]).optional(),
    roiGoal: z.union([z.number(), z.string()]).optional(),
    products: z.array(productSchema).optional(),
    metrics: z
      .object({
        costYuan: z.union([z.number(), z.string()]).optional(),
        payRoi: z.union([z.number(), z.string()]).optional(),
        payGmvYuan: z.union([z.number(), z.string()]).optional(),
        payOrderCount: z.union([z.number(), z.string()]).optional(),
        costPerPayOrderYuan: z.union([z.number(), z.string()]).optional(),
      })
      .strip()
      .optional(),
  })
  .strip()

const promotionPlanListPageSchema = z
  .object({
    current: z.union([z.number(), z.string()]).optional(),
    size: z.union([z.number(), z.string()]).optional(),
    total: z.union([z.number(), z.string()]).optional(),
    totalPages: z.union([z.number(), z.string()]).optional(),
  })
  .strip()

const promotionPlanListQuerySchema = z
  .object({
    marketingGoal: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.string().optional(),
    scene: z.string().optional(),
    keyword: z.string().optional(),
  })
  .strip()

/** Result<T> 成功分支中的计划列表数据，不再混入 ok/status/message 等控制字段。 */
export const promotionPlanListDataSchema = z
  .object({
    advertiserId: z.string(),
    plans: z.array(promotionPlanSchema),
    page: promotionPlanListPageSchema.optional(),
    query: promotionPlanListQuerySchema.optional(),
  })
  .strip()

export type PromotionPlan = z.infer<typeof promotionPlanSchema>
export type PromotionPlanListData = z.infer<typeof promotionPlanListDataSchema>

/** 计划列表 IPC 的稳定联合契约，Renderer 只需根据 ok 判别成功或失败分支。 */
export const promotionPlanListResultSchema = resultSchema(promotionPlanListDataSchema)
export type PromotionPlanListResult = Result<PromotionPlanListData>

/** 兼容 Application/Infrastructure 过渡期使用的旧列表结构，输出同样采用白名单裁剪。 */
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
    page: promotionPlanListPageSchema.optional(),
    query: promotionPlanListQuerySchema.optional(),
    requestId: z.string().optional(),
  })
  .strip()

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

/** Infrastructure/Application 过渡期间使用的旧详情结构，不能直接作为 IPC 公共协议。 */
export const promotionPlanLegacyDetailResultSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional(),
    message: z.string().optional(),
    platformCode: z.union([z.string(), z.number()]).nullable().optional(),
    requestId: z.string().optional(),
    snapshot: promotionPlanDetailSnapshotSchema.optional(),
  })
  .strip()

/** 详情 IPC 的成功数据只暴露经过主进程裁剪的版本化快照。 */
export const promotionPlanDetailDataSchema = z.object({ snapshot: promotionPlanDetailSnapshotSchema }).strip()

export const promotionPlanDetailResultSchema = resultSchema(promotionPlanDetailDataSchema)

export type PromotionPlanDetailInput = z.infer<typeof promotionPlanDetailInputSchema>
export type PromotionPlanDetailSnapshot = z.infer<typeof promotionPlanDetailSnapshotSchema>
export type PromotionPlanLegacyDetailResult = z.infer<typeof promotionPlanLegacyDetailResultSchema>
export type PromotionPlanDetailData = z.infer<typeof promotionPlanDetailDataSchema>
export type PromotionPlanDetailResult = Result<PromotionPlanDetailData>

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
