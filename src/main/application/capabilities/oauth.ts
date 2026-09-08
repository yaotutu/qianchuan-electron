/**
 * OAuth 能力契约。
 *
 * Application 只依赖这些稳定的业务语义，不知道 OAuth 服务端的 URL、HTTP Response、
 * 请求头或 JSON 传输细节。具体的 HTTP 客户端由组合根注入，便于测试和未来替换实现。
 */

export type OAuthUser = {
  id?: string
  displayName?: string
  email?: string
  appId?: string | number
  scopeCount?: number
}

export type OAuthAdvertiserAccount = {
  advertiserId: string
  advertiserName?: string
  shopName?: string
}

/**
 * 这是主进程应用层真正需要的短期授权信息。OAuth 服务端的 Refresh Token 不进入该契约，
 * 从 Infrastructure 响应解析开始就被丢弃，避免凭据沿着应用层依赖链传播。
 */
export type OAuthTokenPayload = {
  accessToken?: string
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
  advertiserIds?: string[]
  advertiserAccounts?: OAuthAdvertiserAccount[]
}

type OAuthResultBase = {
  ok?: boolean
  status?: string
  message?: string
  errorDescription?: string
}

export type OAuthLoginStartResult = OAuthResultBase & {
  authorizationUrl?: string
  attemptId?: string
  startedAt?: string
  expiresInSeconds?: number
}

export type OAuthLoginStatusResult = OAuthResultBase & {
  user?: OAuthUser
  token?: OAuthTokenPayload
}

export type OAuthAuthorizationResult = OAuthResultBase & {
  user?: OAuthUser
  token?: OAuthTokenPayload
}

export type OAuthHealthResult = OAuthResultBase & {
  version?: string
  configured?: boolean
  capabilities?: string[]
  missingConfig?: string[]
}

/**
 * OAuth 请求失败的稳定分类。
 *
 * 这里不暴露平台原始响应，也不把任意 HTTP 客户端错误对象带入 Application；
 * 应用层只需要 status 和服务端声明的业务状态来决定是否重新授权或清理缓存。
 */
export type OAuthCapabilityErrorDetails = {
  status?: number
  payloadStatus?: string
  message: string
}

export type OAuthCapabilityError = Error & {
  readonly kind: 'oauth_capability_error'
  readonly status?: number
  readonly payloadStatus?: string
}

export const createOAuthCapabilityError = ({
  message,
  status,
  payloadStatus,
  cause,
}: OAuthCapabilityErrorDetails & { cause?: unknown }): OAuthCapabilityError => {
  const error = new Error(message, { cause }) as OAuthCapabilityError
  Object.assign(error, { kind: 'oauth_capability_error' as const, status, payloadStatus })
  return error
}

export const getOAuthCapabilityErrorDetails = (error: unknown): OAuthCapabilityErrorDetails => {
  if (error && typeof error === 'object' && 'kind' in error && error.kind === 'oauth_capability_error') {
    const capabilityError = error as OAuthCapabilityError
    return {
      status: capabilityError.status,
      payloadStatus: capabilityError.payloadStatus,
      message: capabilityError.message,
    }
  }

  return {
    message: error instanceof Error ? error.message : '未知错误',
  }
}

/** Application 使用的最小 OAuth 能力集合。 */
export type OAuthCapabilities = {
  startLogin: () => Promise<OAuthLoginStartResult>
  getLoginStatus: (attemptId: string) => Promise<OAuthLoginStatusResult>
  getCurrentAuthorization: (options?: { forceRefresh?: boolean }) => Promise<OAuthAuthorizationResult>
  getHealth: () => Promise<OAuthHealthResult>
}
