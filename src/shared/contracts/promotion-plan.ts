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
