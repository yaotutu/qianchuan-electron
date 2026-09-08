import {
  getOAuthCapabilityErrorDetails,
  type OAuthAuthorizationResult,
  type OAuthCapabilities,
  type OAuthLoginStatusResult,
  type OAuthTokenPayload,
} from './capabilities/oauth'

type AuthServiceDependencies = {
  oauth: OAuthCapabilities
  openExternal: (url: string) => Promise<void>
  now?: () => Date
}

const REQUIRED_SERVER_CAPABILITIES = ['oauth-attempt-result', 'current-authorization']

/**
 * 登录尝试状态只存在于 Electron 主进程内存中。
 * 服务端负责安全保存和刷新凭据，Electron 主进程拿到 Access Token 后直接调用巨量平台 API。
 * Renderer 不接触 Access Token、Refresh Token 或 App Secret。
 */
export const createAuthService = ({ oauth, openExternal, now = () => new Date() }: AuthServiceDependencies) => {
  let activeAttemptId: string | null = null
  let activeLoginStartedAt: string | null = null

  // 主进程缓存的 Access Token 和授权广告主列表
  // Access Token 是用户级别的短期凭证（约 1 小时过期），缓存在主进程内存中
  let cachedAccessToken: string | null = null
  let cachedAdvertiserIds: string[] = []
  /**
   * 启动恢复、Renderer 首次查询和 Token 失效重试可能同时触发 /oauth/current。
   * 合并并发请求可以避免同一时刻重复刷新服务端 Refresh Token，也避免缓存被较旧响应覆盖。
   */
  let authorizationRestoreInFlight: Promise<OAuthAuthorizationResult> | null = null

  const clearActiveAttempt = () => {
    activeAttemptId = null
    activeLoginStartedAt = null
  }

  const clearAuthorizationCache = () => {
    // 授权被撤销或刷新失败时必须清空旧缓存，避免继续使用已作废的本地凭证。
    cachedAccessToken = null
    cachedAdvertiserIds = []
  }

  const startLogin = async () => {
    const result = await oauth.startLogin()
    if (result.ok !== true || typeof result.authorizationUrl !== 'string' || typeof result.attemptId !== 'string') {
      return { ok: false, status: 'server_unavailable', message: '登录服务暂未准备好，请稍后重试。' }
    }

    activeAttemptId = result.attemptId
    activeLoginStartedAt = result.startedAt ?? now().toISOString()
    await openExternal(result.authorizationUrl)
    return {
      ok: true,
      status: 'waiting',
      startedAt: activeLoginStartedAt,
      expiresInSeconds: result.expiresInSeconds,
      message: '已打开巨量授权页面，请在浏览器中完成授权。',
    }
  }

  /** 授权结果里的 Token 形状；仅主进程内部读取，不作为公开类型导出。 */
  type AuthorizationToken = OAuthTokenPayload

  /**
   * 裁剪任意授权结果中的 Token 原文；OAuth 轮询和当前授权都必须经过这里。
   * 这里显式重建 token 对象，而不是简单透传服务端结果，避免未来服务端增加字段时意外泄露密钥。
   */
  const stripTokenSecrets = <T extends OAuthLoginStatusResult | OAuthAuthorizationResult>(result: T) => {
    const token = result.token as AuthorizationToken | undefined
    if (!token) return result

    return {
      ...result,
      token: {
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        advertiserIds: token.advertiserIds ?? [],
        advertiserAccounts: token.advertiserAccounts ?? [],
      },
    }
  }

  const getLoginStatus = async () => {
    if (!activeAttemptId) return { ok: true, status: 'idle', message: '还没有发起本次授权。' }
    try {
      const result = await oauth.getLoginStatus(activeAttemptId)
      if (result.status !== 'waiting') clearActiveAttempt()
      return stripTokenSecrets(result)
    } catch (error) {
      if (getOAuthCapabilityErrorDetails(error).status === 404) {
        clearActiveAttempt()
        return { ok: false, status: 'expired', message: '本次登录请求已经失效，请重新登录。' }
      }
      throw error
    }
  }

  /**
   * 主进程内部使用的授权载荷。
   * Access Token 只停留在主进程内存中；Refresh Token 永远只由 OAuth 服务端持久化和使用。
   * 返回 Renderer 前会被裁剪为非敏感字段。
   */
  const readAuthorization = async (forceRefresh = false) => {
    if (authorizationRestoreInFlight) return authorizationRestoreInFlight

    authorizationRestoreInFlight = (async () => {
      const result = await oauth.getCurrentAuthorization({ forceRefresh })
      const token = result.token

      if (token?.accessToken) {
        cachedAccessToken = token.accessToken
        cachedAdvertiserIds = [...(token.advertiserIds ?? [])]
      } else {
        clearAuthorizationCache()
      }

      // 无论服务端是否有有效 Access Token，都不能把 Token 原文传给 Renderer。
      return stripTokenSecrets(result)
    })().finally(() => {
      authorizationRestoreInFlight = null
    })

    return authorizationRestoreInFlight
  }

  /** Renderer 使用的当前授权状态；这里保证不会返回 Token 原文。 */
  const getCurrentAuthorization = async () => {
    try {
      return await readAuthorization()
    } catch (error) {
      const details = getOAuthCapabilityErrorDetails(error)
      if (details.status === 404) {
        clearAuthorizationCache()
        return { ok: true, status: 'idle', message: '当前还没有完成授权。' }
      }
      if (details.status === 401) {
        // 401 表示 Refresh Token 不可恢复，需要清理主进程缓存并引导用户重新授权。
        clearAuthorizationCache()
        const requiresLogin = details.payloadStatus === 'reauthorization_required'
        return {
          ok: false,
          status: requiresLogin ? 'reauthorization_required' : 'token_refresh_failed',
          message: requiresLogin ? '授权已失效，请重新登录。' : '登录服务暂时无法续期授权，请稍后重新检测。',
        }
      }
      throw error
    }
  }

  /**
   * 供业务 API 客户端触发安全刷新。
   * 每次 OpenAPI 请求返回 Token 失效错误时最多调用一次，避免无限重试。
   */
  const refreshAccessToken = async () => {
    try {
      await readAuthorization(true)
      return cachedAccessToken
    } catch (error) {
      const status = getOAuthCapabilityErrorDetails(error).status
      if (status === 404 || status === 401) {
        clearAuthorizationCache()
        return null
      }
      throw error
    }
  }

  const getHealth = async () => {
    const health = await oauth.getHealth()
    const capabilities = health.capabilities ?? []
    if (
      typeof health.version !== 'string' ||
      REQUIRED_SERVER_CAPABILITIES.some((capability) => !capabilities.includes(capability))
    ) {
      return { ok: false, status: 'server_outdated', message: '登录服务仍在运行旧版本，请重启登录服务后再试。' }
    }
    if (health.configured !== true) {
      console.error('OAuth 服务端配置未完成：', health.missingConfig ?? [])
      return { ok: false, status: 'server_unavailable', message: '登录服务暂未准备好，请稍后重试。' }
    }
    return { ok: true, status: 'ready', version: health.version }
  }

  return {
    startLogin,
    getLoginStatus,
    getCurrentAuthorization,
    getHealth,
    /**
     * 返回主进程缓存的 Access Token，供千川 API 客户端直接使用。
     * 应用退出后该值自然丢失，下次启动由 /oauth/current 自动恢复，不能从磁盘读取。
     */
    getAccessToken: () => cachedAccessToken,
    /** 返回当前授权的广告主 ID 列表，用于越权检查。 */
    getAdvertiserIds: () => [...cachedAdvertiserIds],
    /** 触发服务端自动刷新，并返回新的短期 Access Token。 */
    refreshAccessToken,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
