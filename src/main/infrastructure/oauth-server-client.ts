export type JsonRecord = Record<string, unknown>
export type OAuthServerRequestError = Error & { status?: number; payload?: JsonRecord }

export type OAuthServerClient = {
  request: (pathname: string) => Promise<JsonRecord>
}

type OAuthServerClientOptions = {
  baseUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export const getRequestErrorDetails = (error: unknown): OAuthServerRequestError =>
  error instanceof Error ? (error as OAuthServerRequestError) : (new Error('未知错误') as OAuthServerRequestError)

/**
 * 对 OAuth 服务端的访问统一封装在主进程基础设施层。
 * Renderer 不知道服务端地址，也不会接触平台 Token、Cookie、Secret 或原始请求头。
 */
export const createOAuthServerClient = ({
  baseUrl,
  timeoutMs = 20_000,
  fetchImpl = fetch,
}: OAuthServerClientOptions): OAuthServerClient => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  const request = async (pathname: string): Promise<JsonRecord> => {
    let response: Response
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${pathname}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new Error(`无法连接 OAuth 服务端（${normalizedBaseUrl}）。请先启动 qianchuan-oauth-callback。`, {
        cause: error,
      })
    }

    let payload: JsonRecord
    try {
      payload = (await response.json()) as JsonRecord
    } catch (error) {
      throw new Error('OAuth 服务端返回了无法解析的数据。', { cause: error })
    }

    if (!response.ok) {
      const message =
        typeof payload.message === 'string' ? payload.message : `OAuth 服务端请求失败（HTTP ${response.status}）`
      const requestError = new Error(message) as OAuthServerRequestError
      requestError.status = response.status
      requestError.payload = payload
      throw requestError
    }
    return payload
  }

  return { request }
}
