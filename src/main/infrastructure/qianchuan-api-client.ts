/**
 * 千川开放平台 API 客户端。
 *
 * Electron 主进程直接调用巨量开放平台 /open_api/... 接口，
 * 不再经过 OAuth 服务端代理。
 *
 * Access Token 通过请求头 `Access-Token` 传递，不放入 URL。
 * App Secret 永远不在此模块中使用——它只存在于服务端。
 *
 * 安全约束：
 * - Access Token 只在主进程内存中，不传给 Renderer；
 * - 请求超时有上限，避免界面长时间等待；
 * - 平台错误被映射为稳定的错误类型，不透传平台原始错误对象。
 */
import type { JsonRecord } from './oauth-server-client'

export type { JsonRecord }

/** 千川 API 错误类型，映射平台返回的非零 code。 */
export class QianchuanApiError extends Error {
  constructor(
    message: string,
    readonly platformCode?: string | number,
    readonly requestId?: string,
    readonly platformMessage?: string,
  ) {
    super(message)
    this.name = 'QianchuanApiError'
  }
}

/** 网络错误类型，请求未到达平台或响应不是合法 JSON。 */
export class QianchuanNetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'QianchuanNetworkError'
  }
}

export interface QianchuanApiClientOptions {
  /** 请求超时（毫秒），默认 15 秒。 */
  timeoutMs?: number
  /** 可注入的 fetch 实现，用于测试。 */
  fetchImpl?: typeof fetch
}

/**
 * 统一解析巨量接口响应。
 * 平台成功返回 code === 0，非零 code 表示业务错误。
 */
const requestJson = async (
  url: string,
  accessToken: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  operation: string,
): Promise<JsonRecord> => {
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Access-Token': accessToken,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new QianchuanNetworkError(`${operation}网络请求失败`, error)
  }

  let payload: JsonRecord
  try {
    payload = (await response.json()) as JsonRecord
  } catch (error) {
    throw new QianchuanNetworkError(`${operation}返回内容不是合法 JSON`, error)
  }

  if (!response.ok) {
    throw new QianchuanApiError(
      `${operation} HTTP 状态异常`,
      payload.code as string | number | undefined,
      payload.request_id as string | undefined,
      typeof payload.message === 'string' ? payload.message : '',
    )
  }

  if (Number(payload?.code) !== 0) {
    throw new QianchuanApiError(
      `${operation}被平台拒绝`,
      payload.code as string | number | undefined,
      payload.request_id as string | undefined,
      typeof payload.message === 'string' ? payload.message : '',
    )
  }

  return payload
}

/**
 * 创建千川 API 客户端。
 *
 * 使用方法：
 * ```ts
 * const client = createQianchuanApiClient()
 * const payload = await client.request(url, accessToken)
 * ```
 */
export const createQianchuanApiClient = ({
  timeoutMs = 15_000,
  fetchImpl = fetch,
}: QianchuanApiClientOptions = {}) => ({
  /**
   * 发起 GET 请求到巨量开放平台接口。
   * 参数已经编码在 url 中，Access Token 通过请求头传递。
   */
  request: async (url: string, accessToken: string, operation: string): Promise<JsonRecord> =>
    requestJson(url, accessToken, timeoutMs, fetchImpl, operation),
})
