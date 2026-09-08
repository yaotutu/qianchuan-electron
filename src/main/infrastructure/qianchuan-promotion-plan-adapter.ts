/**
 * 千川商品计划 OpenAPI 适配器。
 *
 * 本模块是平台边界：
 * - 负责把应用输入转换为官方 URL 和请求载荷；
 * - 负责调用 QianchuanApiClient；
 * - 负责把平台响应标准化为共享契约；
 * - 不向应用层泄露 URL、平台字段或 API 客户端类型。
 *
 * 计划业务规则（授权归属、并发快照、写入白名单）不放在这里，
 * 这样应用层可以在没有真实网络的情况下稳定测试。
 */
import type {
  PromotionPlanPlatformCapabilities,
  PromotionPlanPlatformDetailInput,
  PromotionPlanPlatformListInput,
  PromotionPlanPlatformWriteInput,
} from '../application/capabilities/promotion-plan'
import { QianchuanApiError, type QianchuanApiClient } from './qianchuan-api-client'
import {
  buildProductPlanDetailUrl,
  buildProductPlanListUrl,
  normalizeProductPlanDetailResponse,
  normalizeProductPlanResponse,
  parseProductPlanDetailQuery,
  parseProductPlanQuery,
} from './qianchuan-domain'

const QIANCHUAN_API_ORIGIN = 'https://api.oceanengine.com'

/**
 * 把应用查询模型映射成平台边界使用的参数名。
 *
 * 这是整个客户端唯一允许出现这组平台 snake_case 查询字段的地方之一，
 * 页面、preload 和应用服务都不应为了调用接口而提前了解这些命名。
 */
const queryToPlatformParams = (query: PromotionPlanPlatformListInput['query']): Record<string, string | undefined> => ({
  advertiser_id: query.advertiserId,
  keyword: query.keyword,
  status: query.status,
  scene: query.scene,
  start_date: query.dateRange.startDate,
  end_date: query.dateRange.endDate,
  page: String(query.pagination.page),
  page_size: String(query.pagination.pageSize),
})

/**
 * 仅识别明确的 Access Token 失效错误，避免业务失败被错误重试。
 * 这里保留平台错误码判断，应用层只看到这个稳定的布尔能力。
 */
const isAccessTokenInvalid = (error: unknown) =>
  error instanceof QianchuanApiError &&
  (String(error.platformCode ?? '') === '40105' || /access token (?:is )?invalid/i.test(error.platformMessage ?? ''))

export const createQianchuanPromotionPlanAdapter = ({
  apiClient,
}: {
  apiClient: QianchuanApiClient
}): PromotionPlanPlatformCapabilities => ({
  list: async ({ accessToken, query: input, authorizedAdvertiserIds, now }) => {
    const query = parseProductPlanQuery(queryToPlatformParams(input), authorizedAdvertiserIds, now)
    const payload = await apiClient.request(buildProductPlanListUrl(query), accessToken, '获取商品投放计划')
    return normalizeProductPlanResponse(payload, query)
  },

  getDetail: async ({ accessToken, input, authorizedAdvertiserIds, fetchedAt }) => {
    const query = parseProductPlanDetailQuery(input.advertiserId, input.adId, authorizedAdvertiserIds)
    const payload = await apiClient.request(buildProductPlanDetailUrl(query), accessToken, '获取计划详情')
    return normalizeProductPlanDetailResponse(payload, query.advertiserId, fetchedAt)
  },

  executeWrite: async ({ accessToken, command }: PromotionPlanPlatformWriteInput) => {
    const operationName = command.operation === 'UPDATE_BUDGET' ? '更新计划预算' : '更新计划支付 ROI'
    const payload = await apiClient.post(
      `${QIANCHUAN_API_ORIGIN}${command.endpoint}`,
      accessToken,
      command.payload,
      operationName,
    )
    return {
      operation: command.operation,
      ok: true,
      requestId: typeof payload.request_id === 'string' ? payload.request_id : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    }
  },

  isAccessTokenInvalid,
})
