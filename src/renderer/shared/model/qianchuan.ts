import { z } from 'zod'

/**
 * Renderer 只校验页面真正依赖的字段，其余平台字段由 passthrough 保留。
 * 这样既能防止 IPC 返回完全错误的数据，也不会因为平台新增字段导致客户端崩溃。
 */
export const advertiserAccountSchema = z
  .object({
    advertiserId: z.union([z.string(), z.number()]).transform(String),
    advertiserName: z.string().optional(),
    shopName: z.string().optional(),
  })
  .passthrough()

export const authorizationSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional().default('error'),
    message: z.string().optional(),
    errorDescription: z.string().optional(),
    user: z
      .object({
        id: z.union([z.string(), z.number()]).optional().transform((value) =>
          value === undefined ? undefined : String(value),
        ),
        displayName: z.string().optional(),
        email: z.string().optional(),
        appId: z.union([z.string(), z.number()]).optional(),
        scopeCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
    token: z
      .object({
        accessTokenExpiresAt: z.string().optional(),
        advertiserIds: z.array(z.union([z.string(), z.number()]).transform(String)).optional(),
        advertiserAccounts: z.array(advertiserAccountSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const healthSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional().default('error'),
    message: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough()

export const productSchema = z
  .object({
    name: z.string().optional(),
    image: z.string().optional(),
  })
  .passthrough()

export const promotionPlanSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    advertiserId: z.union([z.string(), z.number()]).optional().transform((value) =>
      value === undefined ? undefined : String(value),
    ),
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

export const promotionPlanResultSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional(),
    message: z.string().optional(),
    platformCode: z.union([z.string(), z.number()]).nullable().optional(),
    advertiserId: z.union([z.string(), z.number()]).optional().transform((value) =>
      value === undefined ? undefined : String(value),
    ),
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

export type AdvertiserAccount = z.infer<typeof advertiserAccountSchema>
export type AuthorizationResult = z.infer<typeof authorizationSchema>
export type HealthResult = z.infer<typeof healthSchema>
export type PromotionPlan = z.infer<typeof promotionPlanSchema>
export type PromotionPlanResult = z.infer<typeof promotionPlanResultSchema>

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

export type QianchuanBridge = {
  auth: {
    startLogin: () => Promise<unknown>
    getLoginStatus: () => Promise<unknown>
    getCurrent: () => Promise<unknown>
    getHealth: () => Promise<unknown>
  }
  promotionMonitor: {
    listPlans: (filters: PromotionPlanFilters) => Promise<unknown>
  }
}

declare global {
  interface Window {
    qianchuan?: QianchuanBridge
  }
}
