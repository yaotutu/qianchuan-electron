/**
 * 商品投放计划应用服务。
 *
 * 这是应用层编排函数，只依赖显式能力函数：
 * - TokenProvider：提供主进程内存中的短期 Access Token；
 * - PromotionPlanPlatformCapabilities：访问平台的已标准化能力。
 *
 * 平台 URL、请求载荷、平台字段和平台错误类型都被隔离在 Infrastructure，
 * 因此后续更换接口实现时不需要改动本层的业务流程。
 */
import type {
  PromotionPlan,
  PromotionPlanDetailInput,
  PromotionPlanDetailResult,
  PromotionPlanLegacyDetailResult,
  PromotionPlanDetailSnapshot,
  PromotionPlanListInput,
  PromotionPlanListData,
  PromotionPlanMonitorSelectionInput,
} from '../../shared/contracts/promotion-plan'
import { failureResult, resultFromUnknownError, successResult, type Result } from '../../shared/contracts/result'
import type {
  PromotionPlanWriteData,
  PromotionPlanWriteInput,
  PromotionPlanWriteResult,
} from '../../shared/contracts/promotion-plan-write'
import { buildPromotionPlanWritePreflight } from '../../shared/domain/promotion-plan-write-preflight'
import type {
  MonitorPlanSnapshot,
  PromotionPlanListQuery,
  PromotionPlanPlatformCapabilities,
  PromotionPlanTokenProvider,
} from './capabilities/promotion-plan'

type PromotionPlanQuery = PromotionPlanListInput

export type TokenProvider = PromotionPlanTokenProvider

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const toFiniteNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/**
 * 应用层先做广告主归属校验，再把已确认的账号交给平台适配器。
 * 这样 Renderer 不能借由构造任意 advertiser_id 让基础设施直接发出越权请求。
 */
const resolveAuthorizedAdvertiserId = (requestedAdvertiserId: string | undefined, advertiserIds: string[]) => {
  const normalizedAdvertiserIds = [...new Set(advertiserIds.map((value) => String(value).trim()).filter(Boolean))]
  if (normalizedAdvertiserIds.length === 0) {
    throw new Error('当前授权没有可用的广告主账号，请重新授权并勾选店铺。')
  }

  const requested = String(requestedAdvertiserId ?? '').trim()
  const advertiserId = requested || normalizedAdvertiserIds[0]!
  if (!normalizedAdvertiserIds.includes(advertiserId)) {
    throw new Error('无权查询该广告主账号。')
  }
  return advertiserId
}

const normalizeMonitorPlan = (plan: PromotionPlan): MonitorPlanSnapshot | null => {
  const id = String(plan.id ?? '').trim()
  if (!id) return null
  return {
    id,
    name: typeof plan.name === 'string' ? plan.name : undefined,
    budgetYuan: toFiniteNumber(plan.budgetYuan),
    metrics: {
      costYuan: toFiniteNumber(plan.metrics?.costYuan),
      payRoi: toFiniteNumber(plan.metrics?.payRoi),
    },
  }
}

/** 使用北京时间当天作为监控指标口径。 */
export const getChinaDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export type PromotionPlanServiceDeps = {
  platform: PromotionPlanPlatformCapabilities
  tokenProvider: PromotionPlanTokenProvider
  /** 注入当前时间，便于稳定生成详情快照时间和测试监控日期。 */
  now?: () => Date
}

export const createPromotionPlanService = ({
  platform,
  tokenProvider,
  now = () => new Date(),
}: PromotionPlanServiceDeps) => {
  /**
   * 统一执行平台能力，并在明确的 Token 失效错误上做一次有界刷新。
   * 只刷新一次可以防止平台持续报鉴权错误时形成无限重试。
   */
  const requestWithAccessTokenRefresh = async <T>(run: (accessToken: string) => Promise<T>): Promise<T> => {
    const accessToken = tokenProvider.getAccessToken()
    if (!accessToken) throw new Error('当前未登录，请先完成巨量千川授权。')

    try {
      return await run(accessToken)
    } catch (error) {
      if (!platform.isAccessTokenInvalid(error)) throw error

      const refreshedAccessToken = await tokenProvider.refreshAccessToken()
      if (!refreshedAccessToken || refreshedAccessToken === accessToken) throw error

      return run(refreshedAccessToken)
    }
  }

  /** 先检查登录态，再执行参数校验，让用户优先看到“未登录”。 */
  const requireAccessToken = () => {
    const accessToken = tokenProvider.getAccessToken()
    if (!accessToken) throw new Error('当前未登录，请先完成巨量千川授权。')
  }

  /**
   * 把跨进程输入归一化为应用查询模型。
   *
   * 空字符串不代表有效日期或关键词：这里统一转成 undefined，避免平台边界
   * 把页面占位值当作日期解析，从而导致“明明有计划但列表为空”的假失败。
   */
  const normalizeListQuery = (input: PromotionPlanQuery, advertiserId: string): PromotionPlanListQuery => ({
    advertiserId,
    keyword: input.keyword?.trim() ?? '',
    status: input.status?.trim() || 'ALL',
    scene: input.scene?.trim() || 'UNI_PROJECT',
    dateRange: {
      startDate: input.dateRange?.startDate?.trim() || undefined,
      endDate: input.dateRange?.endDate?.trim() || undefined,
    },
    pagination: {
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 20,
    },
  })

  const list = async (input: PromotionPlanQuery = {}) => {
    requireAccessToken()
    const authorizedAdvertiserIds = tokenProvider.getAdvertiserIds()
    const advertiserId = resolveAuthorizedAdvertiserId(input.advertiserId, authorizedAdvertiserIds)
    const query = normalizeListQuery(input, advertiserId)

    return requestWithAccessTokenRefresh((accessToken) =>
      platform.list({
        accessToken,
        query,
        authorizedAdvertiserIds,
        now: () => now().getTime(),
      }),
    )
  }

  /**
   * Result 适配器是列表 IPC 的唯一出口：成功分支只暴露脱敏后的 data，
   * 失败分支把应用内部异常转换成稳定错误码，避免 Renderer 解析旧的可选 status/message 字段。
   * 保留上面的 list 函数供主进程监控调度器使用，迁移期间不改变其内部调用语义。
   */
  const listResult = async (input: PromotionPlanQuery = {}): Promise<Result<PromotionPlanListData>> => {
    try {
      const legacyResult = await list(input)
      if (legacyResult.ok !== true || !legacyResult.advertiserId) {
        return failureResult('PLATFORM_BUSINESS_ERROR', '千川平台未完成本次查询，请检查授权和查询条件后重试。')
      }

      return successResult({
        advertiserId: legacyResult.advertiserId,
        plans: legacyResult.plans,
        page: legacyResult.page,
        query: legacyResult.query,
      })
    } catch (error) {
      return resultFromUnknownError(error)
    }
  }

  /**
   * 监控创建页使用独立的查询语义：只读取当前场景下的候选计划，不继承工作台的日期筛选，
   * 也不允许 Renderer 自己决定分页大小或拼接平台查询参数。
   *
   * 这里仍然复用已核实的商品计划列表能力，而不是新增平台接口；差异只存在于应用层默认口径。
   */
  const findPlansForMonitor = async (
    input: PromotionPlanMonitorSelectionInput = {},
  ): Promise<Result<PromotionPlanListData>> =>
    listResult({
      advertiserId: input.advertiserId,
      scene: input.scene || 'UNI_PROJECT',
      status: 'ALL',
      dateRange: {},
      page: 1,
      pageSize: 100,
    })

  const getDetail = async (input: PromotionPlanDetailInput): Promise<PromotionPlanLegacyDetailResult> => {
    requireAccessToken()
    const authorizedAdvertiserIds = tokenProvider.getAdvertiserIds()
    resolveAuthorizedAdvertiserId(input.advertiserId, authorizedAdvertiserIds)

    return requestWithAccessTokenRefresh((accessToken) =>
      platform.getDetail({
        accessToken,
        input,
        authorizedAdvertiserIds,
        fetchedAt: now().toISOString(),
      }),
    )
  }

  /** 详情 IPC 的稳定出口：只保留快照 data，并统一转换预期失败。 */
  const getDetailResult = async (input: PromotionPlanDetailInput): Promise<PromotionPlanDetailResult> => {
    try {
      const legacyResult = await getDetail(input)
      if (legacyResult.ok !== true || !legacyResult.snapshot) {
        return failureResult('PLATFORM_BUSINESS_ERROR', legacyResult.message || '千川平台未返回有效的计划详情。')
      }
      return successResult({ snapshot: legacyResult.snapshot })
    } catch (error) {
      return resultFromUnknownError(error)
    }
  }

  const validateWriteBaseline = (
    latestSnapshot: PromotionPlanDetailSnapshot | undefined,
    input: PromotionPlanWriteInput,
  ): PromotionPlanWriteResult | undefined => {
    if (!latestSnapshot) {
      return failureResult('PLATFORM_BUSINESS_ERROR', '平台未返回最新计划详情，已取消修改。')
    }
    if (
      latestSnapshot.identity.advertiserId !== input.draft.advertiserId ||
      latestSnapshot.identity.adId !== input.draft.adId
    ) {
      return failureResult('CONFLICT', '最新计划归属与草稿不一致，已取消修改。')
    }
    if (latestSnapshot.contentHash !== input.draft.baseContentHash) {
      return failureResult('CONFLICT', '计划配置已被平台或其他用户更新，请刷新详情后重新确认。')
    }
    if (latestSnapshot.identity.status === 'DELETED') {
      return failureResult('CONFLICT', '该计划已删除，不能执行修改。')
    }
    return undefined
  }

  /**
   * 执行真实写入时不信任 Renderer 生成的命令：先重新读取详情、比较内容摘要，
   * 再用最新快照生成白名单命令。写完后再次读取详情，让页面拿到平台最终状态。
   */
  const update = async (input: PromotionPlanWriteInput): Promise<PromotionPlanWriteResult> => {
    requireAccessToken()
    const latestDetail = await getDetail({ advertiserId: input.draft.advertiserId, adId: input.draft.adId })
    const baselineFailure = validateWriteBaseline(latestDetail.snapshot, input)
    if (baselineFailure) return baselineFailure

    const latestSnapshot = latestDetail.snapshot!
    const latestDraft = {
      ...input.draft,
      baseSnapshotId: latestSnapshot.snapshotId,
      baseContentHash: latestSnapshot.contentHash,
    }
    const preflight = buildPromotionPlanWritePreflight(latestSnapshot, latestDraft)
    if (!preflight.valid || preflight.commands.length === 0) {
      return failureResult(
        'VALIDATION_FAILED',
        preflight.blockingReasons.join('；') || '没有可安全提交的预算或 ROI 修改。',
      )
    }

    const steps: PromotionPlanWriteData['steps'] = []
    for (const command of preflight.commands) {
      try {
        const step = await requestWithAccessTokenRefresh((accessToken) =>
          platform.executeWrite({ accessToken, command }),
        )
        steps.push(step)
      } catch (error) {
        // 官方增量接口没有跨请求事务：前一步成功、后一步失败时不能自动回滚。
        const message = error instanceof Error ? error.message : '平台写入失败。'
        steps.push({ operation: command.operation, ok: false, message })
        if (steps.some((step) => step.ok)) {
          // 部分成功不是普通异常：保留已完成步骤，要求 Renderer 立即刷新并人工核对。
          return successResult({
            status: 'partial_updated',
            message: '计划修改部分完成；之前成功的修改可能已经生效，请刷新详情核对。',
            steps,
          })
        }
        return failureResult('PLATFORM_BUSINESS_ERROR', '计划修改失败，请刷新详情核对后重试。')
      }
    }

    const refreshedDetail = await getDetail({ advertiserId: input.draft.advertiserId, adId: input.draft.adId })
    return successResult({
      status: 'updated',
      message: '平台已接受修改，并已重新读取最新计划详情。',
      steps,
      snapshot: refreshedDetail.snapshot,
    })
  }

  /** 调度器按广告主批量读取计划，找到全部目标后提前停止翻页。 */
  const getAllForMonitor = async (advertiserId: string, promotionPlanIds: string[]): Promise<MonitorPlanSnapshot[]> => {
    const targetIds = new Set(promotionPlanIds)
    const foundPlans = new Map<string, MonitorPlanSnapshot>()
    const today = getChinaDate(now())
    let page = 1
    let totalPages = 1

    do {
      const result = await list({
        advertiserId,
        status: 'ALL',
        scene: 'UNI_PROJECT',
        dateRange: { startDate: today, endDate: today },
        page,
        pageSize: 100,
      })
      const pagePlans = Array.isArray(result.plans) ? result.plans : []
      pagePlans.forEach((plan) => {
        const normalizedPlan = normalizeMonitorPlan(plan)
        if (normalizedPlan && targetIds.has(normalizedPlan.id)) foundPlans.set(normalizedPlan.id, normalizedPlan)
      })
      const pageInfo = asRecord(result.page)
      totalPages = Math.min(1_000, Math.max(1, Number(pageInfo.totalPages) || 1))
      page += 1
    } while (page <= totalPages && foundPlans.size < targetIds.size)

    return [...foundPlans.values()]
  }

  return { list, listResult, findPlansForMonitor, getDetail, getDetailResult, update, getAllForMonitor }
}

export type PromotionPlanService = ReturnType<typeof createPromotionPlanService>
