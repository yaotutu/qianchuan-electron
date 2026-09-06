import { getRequestErrorDetails, type OAuthServerClient } from '../infrastructure/oauth-server-client'

type AuthServiceDependencies = {
  client: OAuthServerClient
  openExternal: (url: string) => Promise<void>
  now?: () => Date
}

const REQUIRED_SERVER_CAPABILITIES = [
  'oauth-attempt-result',
  'current-authorization',
]

/**
 * 登录尝试状态只存在于 Electron 主进程内存中。
 * 服务端负责安全保存和刷新凭据，Electron 主进程拿到 Access Token 后直接调用巨量平台 API。
 * Renderer 不接触 Access Token、Refresh Token 或 App Secret。
 */
export const createAuthService = ({ client, openExternal, now = () => new Date() }: AuthServiceDependencies) => {
  let activeAttemptId: string | null = null
  let activeLoginStartedAt: string | null = null

  // 主进程缓存的 Access Token 和授权广告主列表
  // Access Token 是用户级别的短期凭证（约 1 小时过期），缓存在主进程内存中
  let cachedAccessToken: string | null = null
  let cachedAdvertiserIds: string[] = []

  const clearActiveAttempt = () => {
    activeAttemptId = null
    activeLoginStartedAt = null
  }

  const startLogin = async () => {
    const result = await client.request('/oauth/oceanengine/start?format=json')
    if (result.ok !== true || typeof result.authorizationUrl !== 'string' || typeof result.attemptId !== 'string') {
      return { ok: false, status: 'server_unavailable', message: '登录服务暂未准备好，请稍后重试。' }
    }

    activeAttemptId = result.attemptId
    activeLoginStartedAt = typeof result.startedAt === 'string' ? result.startedAt : now().toISOString()
    await openExternal(result.authorizationUrl)
    return {
      ok: true,
      status: 'waiting',
      startedAt: activeLoginStartedAt,
      expiresInSeconds: result.expiresInSeconds,
      message: '已打开巨量授权页面，请在浏览器中完成授权。',
    }
  }

  const getLoginStatus = async () => {
    if (!activeAttemptId) return { ok: true, status: 'idle', message: '还没有发起本次授权。' }
    try {
      const result = await client.request(`/oauth/result?attempt_id=${encodeURIComponent(activeAttemptId)}`)
      if (result.status !== 'waiting') clearActiveAttempt()
      return result
    } catch (error) {
      if (getRequestErrorDetails(error).status === 404) {
        clearActiveAttempt()
        return { ok: false, status: 'expired', message: '本次登录请求已经失效，请重新登录。' }
      }
      throw error
    }
  }

  const getCurrentAuthorization = async () => {
    try {
      const result = await client.request('/oauth/current')

      // 缓存 Access Token 和广告主列表，供 promotion-plan-service 直接调巨量 API
      const token = result.token as { accessToken?: string; advertiserIds?: string[] } | undefined
      if (token?.accessToken) {
        cachedAccessToken = token.accessToken
        cachedAdvertiserIds = Array.isArray(token.advertiserIds)
          ? token.advertiserIds.map(String)
          : []
      }

      return result
    } catch (error) {
      const details = getRequestErrorDetails(error)
      if (details.status === 404) return { ok: true, status: 'idle', message: '当前还没有完成授权。' }
      if (details.status === 401) {
        const requiresLogin = details.payload?.status === 'reauthorization_required'
        return {
          ok: false,
          status: requiresLogin ? 'reauthorization_required' : 'token_refresh_failed',
          message: requiresLogin ? '授权已失效，请重新登录。' : '登录服务暂时无法续期授权，请稍后重新检测。',
        }
      }
      throw error
    }
  }

  const getHealth = async () => {
    const health = await client.request('/health')
    const capabilities = Array.isArray(health.capabilities) ? health.capabilities : []
    if (
      typeof health.version !== 'string' ||
      REQUIRED_SERVER_CAPABILITIES.some((capability) => !capabilities.includes(capability))
    ) {
      return { ok: false, status: 'server_outdated', message: '登录服务仍在运行旧版本，请重启登录服务后再试。' }
    }
    if (health.configured !== true) {
      console.error('OAuth 服务端配置未完成：', health.missingConfig || [])
      return { ok: false, status: 'server_unavailable', message: '登录服务暂未准备好，请稍后重试。' }
    }
    return { ok: true, status: 'ready', version: health.version }
  }

  return {
    startLogin,
    getLoginStatus,
    getCurrentAuthorization,
    getHealth,
    /** 返回主进程缓存的 Access Token，供千川 API 客户端直接使用。 */
    getAccessToken: () => cachedAccessToken,
    /** 返回当前授权的广告主 ID 列表，用于越权检查。 */
    getAdvertiserIds: () => cachedAdvertiserIds,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
