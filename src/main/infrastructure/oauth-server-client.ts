import type {
  OAuthAdvertiserAccount,
  OAuthAuthorizationResult,
  OAuthCapabilities,
  OAuthHealthResult,
  OAuthLoginStartResult,
  OAuthLoginStatusResult,
} from '../application/capabilities/oauth'
import { createOAuthCapabilityError } from '../application/capabilities/oauth'
import type { JsonRecord } from './json-record'

type OAuthServerClientOptions = {
  baseUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}

const asOptionalString = (value: unknown) => (typeof value === 'string' ? value : undefined)

const asOptionalNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item) => (typeof item === 'string' || typeof item === 'number' ? [String(item)] : []))
    : []

const normalizeUser = (value: unknown) => {
  const user = asRecord(value)
  const id = user.id
  const appId = user.appId ?? user.app_id
  return {
    id: typeof id === 'string' || typeof id === 'number' ? String(id) : undefined,
    displayName: asOptionalString(user.displayName),
    email: asOptionalString(user.email),
    appId: typeof appId === 'string' || typeof appId === 'number' ? appId : undefined,
    scopeCount: asOptionalNumber(user.scopeCount ?? user.scope_count),
  }
}

const normalizeAdvertiserAccounts = (value: unknown): OAuthAdvertiserAccount[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const account = asRecord(item)
    const advertiserId = account.advertiserId ?? account.advertiser_id
    if (typeof advertiserId !== 'string' && typeof advertiserId !== 'number') return []
    return [
      {
        advertiserId: String(advertiserId),
        advertiserName: asOptionalString(account.advertiserName ?? account.advertiser_name),
        shopName: asOptionalString(account.shopName ?? account.shop_name),
      },
    ]
  })
}

const normalizeToken = (value: unknown) => {
  const token = asRecord(value)
  const accessToken = asOptionalString(token.accessToken ?? token.access_token)
  const accessTokenExpiresAt = asOptionalString(token.accessTokenExpiresAt ?? token.access_token_expires_at)
  const refreshTokenExpiresAt = asOptionalString(token.refreshTokenExpiresAt ?? token.refresh_token_expires_at)
  const advertiserIds = asStringArray(token.advertiserIds ?? token.advertiser_ids)

  return {
    accessToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    advertiserIds,
    advertiserAccounts: normalizeAdvertiserAccounts(token.advertiserAccounts ?? token.advertiser_accounts),
  }
}

const normalizeBaseResult = (payload: JsonRecord) => ({
  ok: typeof payload.ok === 'boolean' ? payload.ok : undefined,
  status: asOptionalString(payload.status),
  message: asOptionalString(payload.message),
  errorDescription: asOptionalString(payload.errorDescription ?? payload.error_description),
})

const normalizeLoginStartResult = (payload: JsonRecord): OAuthLoginStartResult => ({
  ...normalizeBaseResult(payload),
  authorizationUrl: asOptionalString(payload.authorizationUrl ?? payload.authorization_url),
  attemptId: asOptionalString(payload.attemptId ?? payload.attempt_id),
  startedAt: asOptionalString(payload.startedAt ?? payload.started_at),
  expiresInSeconds: asOptionalNumber(payload.expiresInSeconds ?? payload.expires_in_seconds),
})

const normalizeAuthorizationResult = (payload: JsonRecord): OAuthAuthorizationResult => ({
  ...normalizeBaseResult(payload),
  user: payload.user === undefined ? undefined : normalizeUser(payload.user),
  token: payload.token === undefined ? undefined : normalizeToken(payload.token),
})

const normalizeLoginStatusResult = (payload: JsonRecord): OAuthLoginStatusResult =>
  normalizeAuthorizationResult(payload)

const normalizeHealthResult = (payload: JsonRecord): OAuthHealthResult => ({
  ...normalizeBaseResult(payload),
  version: asOptionalString(payload.version),
  configured: typeof payload.configured === 'boolean' ? payload.configured : undefined,
  capabilities: asStringArray(payload.capabilities),
  missingConfig: asStringArray(payload.missingConfig ?? payload.missing_config),
})

/**
 * 对 OAuth 服务端的访问统一封装在主进程基础设施层。
 * Renderer 和 Application 都不会接触 pathname、Response 或原始 JSON 对象。
 */
export const createOAuthServerClient = ({
  baseUrl,
  timeoutMs = 20_000,
  fetchImpl = fetch,
}: OAuthServerClientOptions): OAuthCapabilities => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  const request = async (pathname: string): Promise<JsonRecord> => {
    let response: Response
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${pathname}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw createOAuthCapabilityError({
        message: `无法连接 OAuth 服务端（${normalizedBaseUrl}）。请先启动 qianchuan-oauth-callback。`,
        cause: error,
      })
    }

    let payload: JsonRecord
    try {
      payload = asRecord(await response.json())
    } catch (error) {
      throw createOAuthCapabilityError({ message: 'OAuth 服务端返回了无法解析的数据。', cause: error })
    }

    if (!response.ok) {
      throw createOAuthCapabilityError({
        message:
          typeof payload.message === 'string' ? payload.message : `OAuth 服务端请求失败（HTTP ${response.status}）`,
        status: response.status,
        payloadStatus: asOptionalString(payload.status),
      })
    }
    return payload
  }

  return {
    startLogin: async () => normalizeLoginStartResult(await request('/oauth/oceanengine/start')),
    getLoginStatus: async (attemptId) =>
      normalizeLoginStatusResult(await request(`/oauth/result?attempt_id=${encodeURIComponent(attemptId)}`)),
    getCurrentAuthorization: async ({ forceRefresh = false } = {}) =>
      normalizeAuthorizationResult(
        await request(forceRefresh ? '/oauth/current?force_refresh=true' : '/oauth/current'),
      ),
    getHealth: async () => normalizeHealthResult(await request('/health')),
  }
}
