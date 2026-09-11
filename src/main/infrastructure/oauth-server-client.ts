import type {
  OAuthAdvertiserAccount,
  OAuthAuthorizationSummary,
  OAuthAuthorizationTokenResult,
  OAuthCapabilities,
  OAuthHealthResult,
  OAuthLoginStartResult,
  OAuthLoginStatusResult,
  OAuthAccountsResult,
  ProductAuthResult,
  ProductUser,
} from '../application/capabilities/oauth'
import { createOAuthCapabilityError } from '../application/capabilities/oauth'
import type { JsonRecord } from './json-record'

type OAuthServerClientOptions = {
  baseUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  accessToken?: string
  body?: JsonRecord
}

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
const asString = (value: unknown) => (typeof value === 'string' ? value : undefined)
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.flatMap((item) => (typeof item === 'string' ? [item] : [])) : []

const normalizeProductUser = (value: unknown): ProductUser | undefined => {
  const user = asRecord(value)
  const id = asString(user.id)
  const email = asString(user.email)
  const status = asString(user.status)
  return id && email && status ? { id, email, status } : undefined
}

const normalizeAdvertiserAccounts = (value: unknown): OAuthAdvertiserAccount[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const account = asRecord(item)
    const advertiserId = asString(account.advertiserId)
    if (!advertiserId) return []
    return [{ advertiserId, advertiserName: asString(account.advertiserName), shopName: asString(account.shopName) }]
  })
}

const normalizeAuthorization = (value: unknown): OAuthAuthorizationSummary | undefined => {
  const authorization = asRecord(value)
  const authorizationId = asString(authorization.authorizationId)
  const status = authorization.status
  const advertiserSyncStatus = authorization.advertiserSyncStatus
  if (
    !authorizationId ||
    (status !== 'pending' && status !== 'active' && status !== 'reauthorization_required') ||
    (advertiserSyncStatus !== 'pending' && advertiserSyncStatus !== 'success')
  ) {
    return undefined
  }
  const userValue = authorization.user
  const platformUser =
    userValue === null
      ? null
      : (() => {
          const source = asRecord(userValue)
          return {
            id: asString(source.id),
            displayName: asString(source.displayName),
            email: asString(source.email),
            appId: asString(source.appId),
            materialAuthStatus: asString(source.materialAuthStatus),
            scopeCount: asNumber(source.scopeCount),
            apiCount: asNumber(source.apiCount),
          }
        })()
  return {
    authorizationId,
    status,
    advertiserSyncStatus,
    receivedAt: asString(authorization.receivedAt),
    updatedAt: asString(authorization.updatedAt),
    user: platformUser,
    advertiserIds: asStringArray(authorization.advertiserIds),
    advertiserAccounts: normalizeAdvertiserAccounts(authorization.advertiserAccounts),
  }
}

const normalizeProductAuthResult = (payload: JsonRecord): ProductAuthResult => {
  const tokens = asRecord(payload.tokens)
  return {
    ok: payload.ok === true,
    user: normalizeProductUser(payload.user),
    accessToken: asString(tokens.accessToken),
    refreshToken: asString(tokens.refreshToken),
    status: asString(payload.status),
    message: asString(payload.message),
    retryAfterSeconds: asNumber(payload.retryAfterSeconds),
  }
}

const normalizeAuthorizationTokenResult = (payload: JsonRecord): OAuthAuthorizationTokenResult => {
  const authorization = normalizeAuthorization(payload.authorization)
  const source = asRecord(payload.authorization)
  return {
    ...(authorization ?? {
      authorizationId: '',
      status: 'pending',
      advertiserSyncStatus: 'pending',
      user: null,
      advertiserIds: [],
      advertiserAccounts: [],
    }),
    accessToken: asString(source.accessToken) ?? '',
    accessTokenExpiresAt: asString(source.accessTokenExpiresAt),
  }
}

/** 新接口的所有 HTTP 细节只在主进程基础设施层处理。 */
export const createOAuthServerClient = ({
  baseUrl,
  timeoutMs = 20_000,
  fetchImpl = fetch,
}: OAuthServerClientOptions): OAuthCapabilities => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  const request = async (
    pathname: string,
    options: RequestOptions = {},
  ): Promise<{ payload: JsonRecord; status: number }> => {
    let response: Response
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${pathname}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw createOAuthCapabilityError({ message: '无法连接登录服务，请稍后重试。', cause: error })
    }

    // 先读取文本，再尝试解析 JSON：服务端路由不存在时常返回纯文本 404，
    // 不能把“接口不存在”误报成“网络响应无法解析”，否则排查方向会被带偏。
    const responseText = await response.text()
    let payload: JsonRecord = {}
    try {
      payload = responseText ? asRecord(JSON.parse(responseText) as unknown) : {}
    } catch (error) {
      if (!response.ok) {
        throw createOAuthCapabilityError({
          message: `登录服务请求失败（HTTP ${response.status}）`,
          cause: error,
          status: response.status,
        })
      }
      throw createOAuthCapabilityError({
        message: '登录服务返回了无法解析的数据。',
        cause: error,
        status: response.status,
      })
    }
    if (!response.ok) {
      throw createOAuthCapabilityError({
        message: asString(payload.message) ?? `登录服务请求失败（HTTP ${response.status}）`,
        status: response.status,
        payloadStatus: asString(payload.status),
      })
    }
    return { payload, status: response.status }
  }

  const getHealth = async (): Promise<OAuthHealthResult> => {
    const { payload } = await request('/health/ready')
    return {
      ok: payload.ok === true,
      status: asString(payload.status),
      message: asString(payload.message),
      version: asString(payload.version),
      configured: typeof payload.configured === 'boolean' ? payload.configured : undefined,
      databaseConnected: typeof payload.databaseConnected === 'boolean' ? payload.databaseConnected : undefined,
    }
  }

  return {
    getHealth,
    register: async (input) =>
      normalizeProductAuthResult((await request('/auth/register', { method: 'POST', body: { ...input } })).payload),
    login: async (input) =>
      normalizeProductAuthResult((await request('/auth/login', { method: 'POST', body: { ...input } })).payload),
    refreshProductSession: async (refreshToken) =>
      normalizeProductAuthResult((await request('/auth/refresh', { method: 'POST', body: { refreshToken } })).payload),
    logout: async (accessToken) => {
      await request('/auth/logout', { method: 'POST', accessToken })
    },
    startLogin: async (accessToken): Promise<OAuthLoginStartResult> => {
      const { payload } = await request('/oauth/oceanengine/start', { method: 'POST', accessToken })
      return {
        ok: payload.ok === true,
        attemptId: asString(payload.attemptId),
        authorizationUrl: asString(payload.authorizationUrl),
        startedAt: asString(payload.startedAt),
        expiresInSeconds: asNumber(payload.expiresInSeconds),
        status: asString(payload.status),
        message: asString(payload.message),
      }
    },
    getLoginStatus: async (accessToken, attemptId): Promise<OAuthLoginStatusResult> => {
      const { payload } = await request(`/oauth/result?attempt_id=${encodeURIComponent(attemptId)}`, { accessToken })
      return {
        ok: payload.ok === true,
        status: asString(payload.status),
        attemptId: asString(payload.attemptId),
        message: asString(payload.message),
        authorization: normalizeAuthorization(payload.authorization),
      }
    },
    listAccounts: async (accessToken): Promise<OAuthAccountsResult> => {
      const { payload } = await request('/oauth/accounts', { accessToken })
      return {
        ok: payload.ok === true,
        accounts: Array.isArray(payload.accounts)
          ? payload.accounts.flatMap((item) => {
              const account = normalizeAuthorization(item)
              return account ? [account] : []
            })
          : [],
        message: asString(payload.message),
      }
    },
    getAccountToken: async (accessToken, authorizationId) => {
      const { payload } = await request(`/oauth/accounts/${encodeURIComponent(authorizationId)}/token`, { accessToken })
      return normalizeAuthorizationTokenResult(payload)
    },
    deleteAccount: async (accessToken, authorizationId) => {
      await request(`/oauth/accounts/${encodeURIComponent(authorizationId)}`, { method: 'DELETE', accessToken })
    },
  }
}
