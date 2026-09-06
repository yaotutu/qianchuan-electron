import { z } from 'zod'

export type MonitorMetric = 'ROI' | 'COST' | 'BUDGET'
export type MonitorOperator = 'GT' | 'GTE' | 'LT' | 'LTE'
export type MonitorTaskStatus = 'RUNNING' | 'PAUSED'
export type MonitorAction = 'NOTICE'

export type MonitorRule = {
  metric: MonitorMetric
  operator: MonitorOperator
  threshold: number
}

export type MonitorTaskCheckResult = {
  status: string
  message: string
}

export type MonitorTask = {
  id: string
  advertiserId: string
  promotionPlanId: string
  promotionPlanName: string
  productName: string
  productImage: string
  platformStatus: string
  groupName: string
  status: MonitorTaskStatus
  rule: MonitorRule
  action: MonitorAction
  intervalMinutes: number
  createdAt: string
  updatedAt: string
  lastCheckedAt: string | null
  lastResult: MonitorTaskCheckResult
}

/**
 * IPC 命令输入保持宽松，具体业务约束由主进程仓库统一校验。
 * 这样 Renderer 不能绕过主进程规则，旧版本页面传来的缺失字段也能得到明确中文错误。
 */
export type MonitorTaskCreateInput = {
  advertiserId?: string
  plans?: Array<{
    id?: string
    name?: string
    productName?: string
    productImage?: string
    status?: string
  }>
  groupName?: string
  status?: MonitorTaskStatus
  rule?: MonitorRule
  action?: MonitorAction
  intervalMinutes?: number
}

export type MonitorTaskUpdateInput = {
  groupName?: string
  status?: MonitorTaskStatus
  rule?: MonitorRule
  action?: MonitorAction
  intervalMinutes?: number
}

export type MonitorTaskFilters = {
  advertiser_id: string
  keyword: string
  status: 'ALL' | MonitorTaskStatus
  metric: 'ALL' | MonitorMetric
  action: 'ALL' | MonitorAction
  page: number
  page_size: number
}

/** 主进程仓库允许省略筛选项，并在内部应用默认值。 */
export type MonitorTaskStoreFilters = Partial<MonitorTaskFilters>

export type MonitorTaskListResult = {
  tasks: MonitorTask[]
  page: {
    current: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export const monitorRuleSchema = z.object({
  metric: z.enum(['ROI', 'COST', 'BUDGET']),
  operator: z.enum(['GT', 'GTE', 'LT', 'LTE']),
  threshold: z.number().finite(),
})

/** Renderer 传入主进程的结构校验 Schema；业务必填项仍由主进程 Store 给出中文提示。 */
const ipcText = (maximum: number) => z.string().max(maximum)
const ipcId = ipcText(128).trim().min(1)

const monitorTaskPlanInputSchema = z
  .object({
    id: ipcText(128).optional(),
    name: ipcText(500).optional(),
    productName: ipcText(500).optional(),
    productImage: ipcText(2_048).optional(),
    status: ipcText(128).optional(),
  })
  .strip()

export const monitorTaskCreateInputSchema = z
  .object({
    advertiserId: ipcText(128).optional(),
    plans: z.array(monitorTaskPlanInputSchema).max(100).optional(),
    groupName: ipcText(200).optional(),
    status: z.enum(['RUNNING', 'PAUSED']).optional(),
    rule: monitorRuleSchema.optional(),
    action: z.literal('NOTICE').optional(),
    intervalMinutes: z.number().finite().optional(),
  })
  .strip()

export const monitorTaskUpdateInputSchema = z
  .object({
    groupName: ipcText(200).optional(),
    status: z.enum(['RUNNING', 'PAUSED']).optional(),
    rule: monitorRuleSchema.optional(),
    action: z.literal('NOTICE').optional(),
    intervalMinutes: z.number().finite().optional(),
  })
  .strip()

export const monitorTaskFiltersSchema = z
  .object({
    advertiser_id: ipcText(128).optional(),
    keyword: ipcText(500).optional(),
    status: z.enum(['ALL', 'RUNNING', 'PAUSED']).optional(),
    metric: z.enum(['ALL', 'ROI', 'COST', 'BUDGET']).optional(),
    action: z.enum(['ALL', 'NOTICE']).optional(),
    page: z.number().int().min(1).max(10_000).optional(),
    page_size: z.number().int().min(1).max(100).optional(),
  })
  .strip()

export const monitorTaskIdsSchema = z.array(ipcId).min(1).max(1_000)
export const monitorTaskIdSchema = ipcId
export const monitorAdvertiserIdSchema = ipcId
export const monitorTaskStatusSchema = z.enum(['RUNNING', 'PAUSED'])

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
  action: z.literal('NOTICE'),
  intervalMinutes: z.number().int().min(1).max(1_440),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastCheckedAt: z.string().nullable().optional().default(null),
  lastResult: z
    .object({
      // 服务端或历史本地文件可能增加结果状态，读取时保持向后兼容。
      status: z.string(),
      message: z.string(),
    })
    .optional()
    .default({ status: 'PENDING', message: '等待首次检查' }),
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
