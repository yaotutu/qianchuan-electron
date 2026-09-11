import type { AuthState } from '../../shared/contracts/auth'
import {
  getOAuthCapabilityErrorDetails,
  type OAuthAuthorizationSummary,
  type OAuthCapabilities,
  type ProductCredentials,
  type ProductRegisterInput,
  type ProductUser,
} from './capabilities/oauth'
import type { ProductRefreshTokenStore } from './capabilities/product-session-store'

type AuthServiceDependencies = {
  oauth: OAuthCapabilities
  refreshTokenStore: ProductRefreshTokenStore
  openExternal: (url: string) => Promise<void>
}

/**
 * 新版认证服务同时管理两层身份：产品用户会话和该用户绑定的巨量授权。
 * 两类 Access Token 都只保存在主进程内存；磁盘上仅保存 safeStorage 加密后的产品 Refresh Token。
 */
export const createAuthService = ({ oauth, refreshTokenStore, openExternal }: AuthServiceDependencies) => {
  let productUser: ProductUser | null = null
  let productAccessToken: string | null = null
  let oauthAccounts: OAuthAuthorizationSummary[] = []
  let selectedAuthorizationId: string | null = null
  let cachedAccessToken: string | null = null
  let cachedAccessTokenExpiresAt: string | undefined
  let cachedAdvertiserIds: string[] = []
  let activeAttemptId: string | null = null
  let restoreInFlight: Promise<AuthState> | null = null
  let refreshInFlight: Promise<boolean> | null = null

  const clearPlatformSelection = () => {
    selectedAuthorizationId = null
    cachedAccessToken = null
    cachedAccessTokenExpiresAt = undefined
    cachedAdvertiserIds = []
  }

  const clearSession = () => {
    productUser = null
    productAccessToken = null
    oauthAccounts = []
    activeAttemptId = null
    clearPlatformSelection()
    refreshTokenStore.clear()
  }

  /** IPC 状态由白名单字段重新组装，任何 Token 都不会进入 Renderer。 */
  const getState = (): AuthState => ({
    productUser,
    oauthAccounts: oauthAccounts.map((account) => ({
      ...account,
      advertiserIds: [...account.advertiserIds],
      advertiserAccounts: account.advertiserAccounts.map((advertiser) => ({ ...advertiser })),
    })),
    selectedAuthorizationId,
    selectedAdvertiserIds: [...cachedAdvertiserIds],
    accessTokenExpiresAt: cachedAccessTokenExpiresAt,
  })

  const applyProductSession = (result: Awaited<ReturnType<OAuthCapabilities['login']>>) => {
    if (!result.user || !result.accessToken || !result.refreshToken) {
      throw new Error('登录服务返回的会话信息不完整。')
    }

    // 先完成加密落盘，再更新内存会话，避免安全存储失败时留下“看似已登录”的半状态。
    refreshTokenStore.write(result.refreshToken)
    productUser = result.user
    productAccessToken = result.accessToken
  }

  const refreshProductSession = async () => {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = (async () => {
      const refreshToken = refreshTokenStore.read()
      if (!refreshToken) return false
      try {
        applyProductSession(await oauth.refreshProductSession(refreshToken))
        return true
      } catch (error) {
        if ([400, 401, 403].includes(getOAuthCapabilityErrorDetails(error).status ?? 0)) {
          clearSession()
          return false
        }
        throw error
      }
    })().finally(() => {
      refreshInFlight = null
    })
    return refreshInFlight
  }

  const requireProductAccessToken = async () => {
    if (productAccessToken) return productAccessToken
    if (await refreshProductSession()) return productAccessToken as string
    throw new Error('请先登录电小奇账号。')
  }

  /** 产品 Access Token 失效时只刷新并重放一次，避免无边界重试。 */
  const withProductSession = async <T>(request: (accessToken: string) => Promise<T>): Promise<T> => {
    const accessToken = await requireProductAccessToken()
    try {
      return await request(accessToken)
    } catch (error) {
      if (getOAuthCapabilityErrorDetails(error).status !== 401) throw error
      productAccessToken = null
      if (!(await refreshProductSession()) || !productAccessToken) throw error
      return request(productAccessToken)
    }
  }

  const selectAuthorization = async (authorizationId: string) => {
    const account = oauthAccounts.find((item) => item.authorizationId === authorizationId)
    if (!account) throw new Error('选择的巨量授权账号不存在。')
    if (account.status !== 'active') throw new Error('该巨量授权仍在补全中，请稍后重试。')

    const result = await withProductSession((accessToken) => oauth.getAccountToken(accessToken, authorizationId))
    if (!result.accessToken) throw new Error('登录服务没有返回可用的巨量 Access Token。')
    selectedAuthorizationId = result.authorizationId
    cachedAccessToken = result.accessToken
    cachedAccessTokenExpiresAt = result.accessTokenExpiresAt
    cachedAdvertiserIds = [...result.advertiserIds]
    return getState()
  }

  const loadAccounts = async () => {
    const result = await withProductSession((accessToken) => oauth.listAccounts(accessToken))
    oauthAccounts = result.accounts

    const selectedStillExists = oauthAccounts.some(
      (account) => account.authorizationId === selectedAuthorizationId && account.status === 'active',
    )
    if (selectedStillExists && selectedAuthorizationId) {
      await selectAuthorization(selectedAuthorizationId)
    } else {
      clearPlatformSelection()
      const firstActive = oauthAccounts.find((account) => account.status === 'active')
      if (firstActive) await selectAuthorization(firstActive.authorizationId)
    }
    return getState()
  }

  const restoreSession = async () => {
    if (restoreInFlight) return restoreInFlight
    restoreInFlight = (async () => {
      if (!(await refreshProductSession())) return getState()
      return loadAccounts()
    })().finally(() => {
      restoreInFlight = null
    })
    return restoreInFlight
  }

  const login = async (input: ProductCredentials) => {
    applyProductSession(await oauth.login(input))
    await loadAccounts()
    return { ok: true, status: 'authenticated', message: '登录成功。' }
  }

  const register = async (input: ProductRegisterInput) => {
    applyProductSession(await oauth.register(input))
    await loadAccounts()
    return { ok: true, status: 'authenticated', message: '注册并登录成功。' }
  }

  const logout = async () => {
    const accessToken = productAccessToken
    try {
      if (accessToken) await oauth.logout(accessToken)
    } finally {
      clearSession()
    }
    return { ok: true, status: 'logged_out', message: '已退出登录。' }
  }

  const startLogin = async () => {
    const result = await withProductSession((accessToken) => oauth.startLogin(accessToken))
    if (!result.authorizationUrl || !result.attemptId) throw new Error('登录服务没有返回完整的授权地址。')
    activeAttemptId = result.attemptId
    await openExternal(result.authorizationUrl)
    return {
      ok: true,
      status: 'waiting',
      message: '已打开巨量授权页面，请在浏览器中完成授权。',
    }
  }

  const getLoginStatus = async () => {
    if (!activeAttemptId) return { ok: true, status: 'idle', message: '当前没有进行中的巨量授权。' }
    try {
      const result = await withProductSession((accessToken) =>
        oauth.getLoginStatus(accessToken, activeAttemptId as string),
      )
      if (result.status === 'success') {
        activeAttemptId = null
        await loadAccounts()
      } else if (result.status === 'failed') {
        activeAttemptId = null
      }
      return result
    } catch (error) {
      const details = getOAuthCapabilityErrorDetails(error)
      if (details.status === 404 || details.payloadStatus === 'not_found') {
        activeAttemptId = null
        return { ok: false, status: 'expired', message: '本次授权请求已失效，请重新发起。' }
      }
      if (details.payloadStatus === 'failed' || details.payloadStatus === 'reauthorization_required') {
        activeAttemptId = null
        if (details.payloadStatus === 'reauthorization_required') clearPlatformSelection()
        return { ok: false, status: 'failed', message: details.message }
      }
      throw error
    }
  }

  const deleteAuthorization = async (authorizationId: string) => {
    await withProductSession((accessToken) => oauth.deleteAccount(accessToken, authorizationId))
    if (selectedAuthorizationId === authorizationId) clearPlatformSelection()
    await loadAccounts()
    return { ok: true, status: 'deleted', message: '巨量授权已解绑。' }
  }

  const getHealth = async () => {
    const health = await oauth.getHealth()
    if (
      health.ok !== true ||
      health.status !== 'ready' ||
      health.configured !== true ||
      health.databaseConnected !== true
    ) {
      return { ...health, ok: false, message: health.message ?? '登录服务暂未准备好，请稍后重试。' }
    }
    return health
  }

  /** 巨量 Token 失效时，按当前 authorizationId 重新向服务端获取一次。 */
  const refreshAccessToken = async () => {
    if (!selectedAuthorizationId) return null
    try {
      await selectAuthorization(selectedAuthorizationId)
      return cachedAccessToken
    } catch (error) {
      if ([401, 404, 409].includes(getOAuthCapabilityErrorDetails(error).status ?? 0)) {
        clearPlatformSelection()
        return null
      }
      throw error
    }
  }

  return {
    getHealth,
    getState,
    restoreSession,
    register,
    login,
    logout,
    listAccounts: loadAccounts,
    startLogin,
    getLoginStatus,
    selectAuthorization,
    deleteAuthorization,
    getAccessToken: () => cachedAccessToken,
    getAdvertiserIds: () => [...cachedAdvertiserIds],
    refreshAccessToken,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
