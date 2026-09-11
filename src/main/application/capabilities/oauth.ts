/**
 * 新版 OAuth 服务能力契约。
 *
 * 这里刻意只按当前服务端接口建模，不提供任何历史接口兼容入口。
 * Access Token 只在主进程应用层和基础设施层之间流动，绝不作为 IPC 返回值的一部分。
 */
export type ProductUser = {
  id: string
  email: string
  status: 'active' | 'disabled' | string
}

export type ProductCredentials = {
  email: string
  password: string
  deviceName?: string
}

export type ProductRegisterInput = ProductCredentials & {
  verificationCode: string
}

export type ProductAuthResult = {
  ok: boolean
  user?: ProductUser
  accessToken?: string
  refreshToken?: string
  message?: string
  status?: string
  retryAfterSeconds?: number
}

export type OAuthUser = {
  id?: string
  displayName?: string
  email?: string
  appId?: string
  materialAuthStatus?: string
  scopeCount?: number
  apiCount?: number
}

export type OAuthAdvertiserAccount = {
  advertiserId: string
  advertiserName?: string
  shopName?: string
}

export type OAuthAuthorizationSummary = {
  authorizationId: string
  status: 'pending' | 'active' | 'reauthorization_required'
  advertiserSyncStatus: 'pending' | 'success'
  receivedAt?: string
  updatedAt?: string
  user: OAuthUser | null
  advertiserIds: string[]
  advertiserAccounts: OAuthAdvertiserAccount[]
}

export type OAuthAuthorizationTokenResult = OAuthAuthorizationSummary & {
  accessToken: string
  accessTokenExpiresAt?: string
}

export type OAuthLoginStartResult = {
  ok: boolean
  attemptId?: string
  authorizationUrl?: string
  startedAt?: string
  expiresInSeconds?: number
  status?: string
  message?: string
}

export type OAuthLoginStatusResult = {
  ok: boolean
  status?: string
  attemptId?: string
  message?: string
  authorization?: OAuthAuthorizationSummary
}

export type OAuthAccountsResult = {
  ok: boolean
  accounts: OAuthAuthorizationSummary[]
  message?: string
}

export type OAuthHealthResult = {
  ok: boolean
  status?: string
  message?: string
  version?: string
  configured?: boolean
  databaseConnected?: boolean
}

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
  return { message: error instanceof Error ? error.message : '未知错误' }
}

/** Application 只依赖这些最小能力函数，不依赖 HTTP 客户端实现。 */
export type OAuthCapabilities = {
  getHealth: () => Promise<OAuthHealthResult>
  register: (input: ProductRegisterInput) => Promise<ProductAuthResult>
  login: (input: ProductCredentials) => Promise<ProductAuthResult>
  refreshProductSession: (refreshToken: string) => Promise<ProductAuthResult>
  logout: (accessToken: string) => Promise<void>
  startLogin: (accessToken: string) => Promise<OAuthLoginStartResult>
  getLoginStatus: (accessToken: string, attemptId: string) => Promise<OAuthLoginStatusResult>
  listAccounts: (accessToken: string) => Promise<OAuthAccountsResult>
  getAccountToken: (accessToken: string, authorizationId: string) => Promise<OAuthAuthorizationTokenResult>
  deleteAccount: (accessToken: string, authorizationId: string) => Promise<void>
}
