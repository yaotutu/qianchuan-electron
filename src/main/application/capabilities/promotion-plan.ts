import type {
  PromotionPlanDetailInput,
  PromotionPlanDetailResult,
  PromotionPlanResult,
} from '../../../shared/contracts/promotion-plan'
import type {
  PromotionPlanWriteCommand,
  PromotionPlanWriteStepResult,
} from '../../../shared/contracts/promotion-plan-write'

/**
 * 监控调度器真正需要的计划数据。
 *
 * 这里不暴露千川平台字段，避免调度器和平台适配器形成隐式耦合。
 */
export type MonitorPlanSnapshot = {
  id: string
  name?: string
  budgetYuan?: number
  metrics: {
    costYuan?: number
    payRoi?: number
  }
}

/**
 * 应用层已经归一化的计划列表查询。
 *
 * 与 Renderer DTO 分开后，应用服务可以在这里补齐默认值、清洗空字符串，
 * 而平台适配器只接收稳定的业务查询，不再知道页面传入的可选字段结构。
 */
export type PromotionPlanListQuery = {
  advertiserId: string
  keyword: string
  status: string
  scene: string
  dateRange: {
    startDate?: string
    endDate?: string
  }
  pagination: {
    page: number
    pageSize: number
  }
}

/** 计划列表的平台能力输入。平台字段转换由基础设施适配器完成。 */
export type PromotionPlanPlatformListInput = {
  accessToken: string
  query: PromotionPlanListQuery
  authorizedAdvertiserIds: string[]
  now: () => number
}

/** 计划详情查询的应用边界输入。 */
export type PromotionPlanPlatformDetailInput = {
  accessToken: string
  input: PromotionPlanDetailInput
  authorizedAdvertiserIds: string[]
  fetchedAt: string
}

/** 受控写接口的应用边界输入。Renderer 不会直接构造这个输入。 */
export type PromotionPlanPlatformWriteInput = {
  accessToken: string
  command: PromotionPlanWriteCommand
}

/** 写接口只向应用层返回脱敏后的稳定结果。 */
export type PromotionPlanPlatformWriteResult = PromotionPlanWriteStepResult

/**
 * 商品计划平台能力集合。
 *
 * 这是函数集合而不是类或万能网关：应用层只依赖这些能力函数，
 * 具体由千川 OpenAPI 适配器、测试替身或未来的其他数据源实现。
 */
export type PromotionPlanPlatformCapabilities = {
  list: (input: PromotionPlanPlatformListInput) => Promise<PromotionPlanResult>
  getDetail: (input: PromotionPlanPlatformDetailInput) => Promise<PromotionPlanDetailResult>
  executeWrite: (input: PromotionPlanPlatformWriteInput) => Promise<PromotionPlanPlatformWriteResult>
  isAccessTokenInvalid: (error: unknown) => boolean
}

/** 让监控调度器只依赖列表快照，不依赖整个计划应用服务。 */
export type FetchMonitorPlans = (advertiserId: string, promotionPlanIds: string[]) => Promise<MonitorPlanSnapshot[]>

/**
 * 主进程内存中的短期授权能力。Refresh Token 不属于这个类型，永远不进入 Electron。
 */
export type PromotionPlanTokenProvider = {
  getAccessToken: () => string | null
  getAdvertiserIds: () => string[]
  refreshAccessToken: () => Promise<string | null>
}
