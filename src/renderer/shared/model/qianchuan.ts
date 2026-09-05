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
        id: z
          .union([z.string(), z.number()])
          .optional()
          .transform((value) => (value === undefined ? undefined : String(value))),
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

export const monitorRuleSchema = z.object({
  metric: z.enum(['ROI', 'COST', 'BUDGET']),
  operator: z.enum(['GT', 'GTE', 'LT', 'LTE']),
  threshold: z.number(),
})

export const monitorTaskSchema = z.object({
  id: z.string(),
  advertiserId: z.union([z.string(), z.number()]).transform(String),
  promotionPlanId: z.union([z.string(), z.number()]).transform(String),
  promotionPlanName: z.string(),
  productName: z.string().optional().default(''),
  productImage: z.string().optional().default(''),
  platformStatus: z.string().optional().default(''),
  groupName: z.string().optional().default(''),
  status: z.enum(['RUNNING', 'PAUSED']),
  rule: monitorRuleSchema,
  action: z.enum(['NOTICE']),
  intervalMinutes: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastCheckedAt: z.string().nullable().optional(),
  lastResult: z.object({ status: z.string(), message: z.string() }).optional(),
})

export const monitorTaskListResultSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional(),
    message: z.string().optional(),
    advertiserId: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => (value === undefined ? undefined : String(value))),
    tasks: z.array(monitorTaskSchema).optional().default([]),
    page: z
      .object({
        current: z.union([z.number(), z.string()]).optional(),
        pageSize: z.union([z.number(), z.string()]).optional(),
        total: z.union([z.number(), z.string()]).optional(),
        totalPages: z.union([z.number(), z.string()]).optional(),
      })
      .optional(),
  })
  .passthrough()

export const monitorTaskRunResultSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional(),
    message: z.string().optional(),
    checkedCount: z.number().optional().default(0),
    skipped: z.boolean().optional().default(false),
  })
  .passthrough()

export const monitorTaskMutationResultSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional(),
    message: z.string().optional(),
    task: monitorTaskSchema.optional(),
    tasks: z.array(monitorTaskSchema).optional(),
    deletedIds: z.array(z.string()).optional(),
  })
  .passthrough()

export type AdvertiserAccount = z.infer<typeof advertiserAccountSchema>
export type AuthorizationResult = z.infer<typeof authorizationSchema>
export type HealthResult = z.infer<typeof healthSchema>
export type PromotionPlan = z.infer<typeof promotionPlanSchema>
export type PromotionPlanResult = z.infer<typeof promotionPlanResultSchema>
export type MonitorRule = z.infer<typeof monitorRuleSchema>
export type MonitorTask = z.infer<typeof monitorTaskSchema>
export type MonitorTaskListResult = z.infer<typeof monitorTaskListResultSchema>

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

export type MonitorTaskFilters = {
  advertiser_id: string
  keyword: string
  status: 'ALL' | 'RUNNING' | 'PAUSED'
  metric: 'ALL' | MonitorRule['metric']
  action: 'ALL' | 'NOTICE'
  page: number
  page_size: number
}

export type MonitorTaskInput = {
  advertiserId?: string
  plans?: Array<{
    id: string
    name: string
    productName?: string
    productImage?: string
    status?: string
  }>
  groupName?: string
  status?: 'RUNNING' | 'PAUSED'
  rule?: MonitorRule
  action?: 'NOTICE'
  intervalMinutes?: number
}

export type MonitorTaskUpdateInput = {
  groupName?: string
  status?: 'RUNNING' | 'PAUSED'
  rule?: MonitorRule
  action?: 'NOTICE'
  intervalMinutes?: number
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
    listTasks: (filters: MonitorTaskFilters) => Promise<unknown>
    createTask: (input: MonitorTaskInput) => Promise<unknown>
    updateTask: (taskId: string, input: MonitorTaskUpdateInput) => Promise<unknown>
    deleteTask: (taskId: string) => Promise<unknown>
    batchUpdateStatus: (taskIds: string[], status: 'RUNNING' | 'PAUSED') => Promise<unknown>
    batchDelete: (taskIds: string[]) => Promise<unknown>
    runNow: (advertiserId: string) => Promise<unknown>
    onChanged: (listener: () => void) => () => void
  }
}

declare global {
  interface Window {
    qianchuan?: QianchuanBridge
  }
}
