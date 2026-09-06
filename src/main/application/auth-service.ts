import { getRequestErrorDetails, type OAuthServerClient } from '../infrastructure/oauth-server-client'

type AuthServiceDependencies = {
  client: OAuthServerClient
  openExternal: (url: string) => Promise<void>
  now?: () => Date
}

const REQUIRED_SERVER_CAPABILITIES = ['oauth-attempt-result', 'current-authorization', 'product-plan-list']

/**
 * 登录尝试状态只存在于 Electron 主进程内存中。
 * 服务端负责安全保存和刷新凭据，Renderer 只能读取经过裁剪的授权状态。
 */
export const createAuthService = ({ client, openExternal, now = () => new Date() }: AuthServiceDependencies) => {
  let activeAttemptId: string | null = null
  let activeLoginStartedAt: string | null = null

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
      return await client.request('/oauth/current')
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
      // 这里只记录缺失配置项名称，不记录配置值，更不能输出 Token 或 Secret。
      console.error('OAuth 服务端配置未完成：', health.missingConfig || [])
      return { ok: false, status: 'server_unavailable', message: '登录服务暂未准备好，请稍后重试。' }
    }
    return { ok: true, status: 'ready', version: health.version }
  }

  return { startLogin, getLoginStatus, getCurrentAuthorization, getHealth }
}

export type AuthService = ReturnType<typeof createAuthService>
