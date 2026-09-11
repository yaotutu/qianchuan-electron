import { describe, expect, it, vi } from 'vitest'

import type { OAuthCapabilities, OAuthCapabilityError, OAuthAuthorizationSummary } from '../capabilities/oauth'
import { createAuthService } from '../auth-service'
import type { ProductRefreshTokenStore } from '../capabilities/product-session-store'

const createStore = (initial: string | null = null): ProductRefreshTokenStore => {
  let value = initial
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    clear: () => {
      value = null
    },
  }
}

const createOAuth = (overrides: Partial<OAuthCapabilities> = {}): OAuthCapabilities => ({
  getHealth: async () => ({ ok: true, status: 'ready', configured: true, databaseConnected: true }),
  register: async () => ({ ok: true }),
  login: async () => ({ ok: true }),
  refreshProductSession: async () => ({ ok: true }),
  logout: async () => undefined,
  startLogin: async () => ({}),
  getLoginStatus: async () => ({}),
  listAccounts: async () => ({ ok: true, accounts: [] }),
  getAccountToken: async () => ({
    authorizationId: 'authorization-1',
    status: 'active',
    advertiserSyncStatus: 'success',
    user: null,
    advertiserIds: [],
    advertiserAccounts: [],
    accessToken: 'fixture',
  }),
  deleteAccount: async () => undefined,
  ...overrides,
})

const summary: OAuthAuthorizationSummary = {
  authorizationId: 'authorization-1',
  status: 'active',
  advertiserSyncStatus: 'success',
  user: { id: 'platform-user-1', displayName: '千川用户', email: 'platform@example.com' },
  advertiserIds: ['186001'],
  advertiserAccounts: [{ advertiserId: '186001', advertiserName: '测试账户' }],
}

const createHttpError = (status: number, payloadStatus?: string) => {
  const error = new Error('request failed') as OAuthCapabilityError
  Object.assign(error, { kind: 'oauth_capability_error' as const, status, payloadStatus })
  return error
}

describe('新版认证应用服务', () => {
  it('产品登录后加载自己的巨量授权，并只向 Renderer 返回脱敏状态', async () => {
    const getAccountToken = vi.fn(async () => ({
      ...summary,
      accessToken: 'fixture',
      accessTokenExpiresAt: '2026-09-08T12:00:00.000Z',
    }))
    const service = createAuthService({
      oauth: createOAuth({
        login: async () => ({
          ok: true,
          user: { id: 'user-1', email: 'user@example.com', status: 'active' },
          accessToken: 'fixture',
          refreshToken: 'fixture',
        }),
        listAccounts: async () => ({ ok: true, accounts: [summary] }),
        getAccountToken,
      }),
      refreshTokenStore: createStore(),
      openExternal: async () => undefined,
    })

    await expect(service.login({ email: 'user@example.com', password: 'password' })).resolves.toMatchObject({
      ok: true,
      status: 'authenticated',
    })
    expect(service.getState()).toEqual({
      productUser: { id: 'user-1', email: 'user@example.com', status: 'active' },
      oauthAccounts: [summary],
      selectedAuthorizationId: 'authorization-1',
      selectedAdvertiserIds: ['186001'],
      accessTokenExpiresAt: '2026-09-08T12:00:00.000Z',
    })
    expect(service.getState()).not.toHaveProperty('accessToken')
    expect(service.getAccessToken()).toBe('fixture')
    expect(getAccountToken).toHaveBeenCalledWith('fixture', 'authorization-1')
  })

  it('发起 OAuth 时使用产品会话 Bearer，并通过系统浏览器打开授权地址', async () => {
    const openExternal = vi.fn(async () => undefined)
    const startLogin = vi.fn(async () => ({
      ok: true,
      attemptId: 'attempt-1',
      authorizationUrl: 'https://example.com/oauth',
    }))
    const service = createAuthService({
      oauth: createOAuth({
        login: async () => ({
          ok: true,
          user: { id: 'user-1', email: 'user@example.com', status: 'active' },
          accessToken: 'fixture',
          refreshToken: 'fixture',
        }),
        startLogin,
      }),
      refreshTokenStore: createStore(),
      openExternal,
    })

    await service.login({ email: 'user@example.com', password: 'password' })
    await expect(service.startLogin()).resolves.toMatchObject({ ok: true, status: 'waiting' })
    expect(startLogin).toHaveBeenCalledWith('fixture')
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth')
  })

  it('并发恢复产品会话时只刷新一次并加载一次授权列表', async () => {
    let resolveRefresh: ((value: Awaited<ReturnType<OAuthCapabilities['refreshProductSession']>>) => void) | undefined
    const refreshProductSession = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<OAuthCapabilities['refreshProductSession']>>>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    const listAccounts = vi.fn(async () => ({ ok: true, accounts: [] }))
    const service = createAuthService({
      oauth: createOAuth({ refreshProductSession, listAccounts }),
      refreshTokenStore: createStore('fixture'),
      openExternal: async () => undefined,
    })

    const first = service.restoreSession()
    const second = service.restoreSession()
    expect(refreshProductSession).toHaveBeenCalledTimes(1)
    resolveRefresh?.({
      ok: true,
      user: { id: 'user-1', email: 'user@example.com', status: 'active' },
      accessToken: 'fixture',
      refreshToken: 'fixture',
    })

    const results = await Promise.all([first, second])
    expect(results[0]).toEqual(service.getState())
    expect(results[1]).toEqual(service.getState())
    expect(listAccounts).toHaveBeenCalledTimes(1)
  })

  it('并发产品接口遇到 401 时只轮换一次 Refresh Token', async () => {
    let refreshCount = 0
    const listAccounts = vi.fn(async (accessToken: string) => {
      if (accessToken === 'expired-product-token') throw createHttpError(401, 'unauthorized')
      return { ok: true, accounts: [] }
    })
    const service = createAuthService({
      oauth: createOAuth({
        refreshProductSession: async () => {
          refreshCount += 1
          await new Promise((resolve) => setTimeout(resolve, 5))
          return {
            ok: true,
            user: { id: 'user-1', email: 'user@example.com', status: 'active' },
            accessToken: `product-token-${refreshCount}`,
            refreshToken: 'rotated-refresh-token',
          }
        },
        listAccounts,
      }),
      refreshTokenStore: createStore('stored-refresh-token'),
      openExternal: async () => undefined,
    })

    await service.restoreSession()
    // 模拟后续两个并发业务请求同时发现产品 Access Token 已失效。
    listAccounts.mockImplementation(async (accessToken: string) => {
      if (accessToken === 'product-token-1') throw createHttpError(401, 'unauthorized')
      return { ok: true, accounts: [] }
    })

    await Promise.all([service.listAccounts(), service.listAccounts()])
    expect(refreshCount).toBe(2)
  })

  it('巨量 Token 失效时只按当前 authorizationId 重新获取一次', async () => {
    const getAccountToken = vi
      .fn()
      .mockResolvedValueOnce({ ...summary, accessToken: 'fixture', accessTokenExpiresAt: '2026-09-08T12:00:00.000Z' })
      .mockResolvedValueOnce({ ...summary, accessToken: 'fixture', accessTokenExpiresAt: '2026-09-08T13:00:00.000Z' })
    const service = createAuthService({
      oauth: createOAuth({
        login: async () => ({
          ok: true,
          user: { id: 'user-1', email: 'user@example.com', status: 'active' },
          accessToken: 'fixture',
          refreshToken: 'fixture',
        }),
        listAccounts: async () => ({ ok: true, accounts: [summary] }),
        getAccountToken,
      }),
      refreshTokenStore: createStore(),
      openExternal: async () => undefined,
    })

    await service.login({ email: 'user@example.com', password: 'password' })
    await expect(service.refreshAccessToken()).resolves.toBe('fixture')
    expect(getAccountToken).toHaveBeenCalledTimes(2)
    expect(getAccountToken).toHaveBeenLastCalledWith('fixture', 'authorization-1')
  })

  it('指定授权仍在补全或已失效时清空当前平台选择', async () => {
    const service = createAuthService({
      oauth: createOAuth({
        login: async () => ({
          ok: true,
          user: { id: 'user-1', email: 'user@example.com', status: 'active' },
          accessToken: 'fixture',
          refreshToken: 'fixture',
        }),
        listAccounts: async () => ({ ok: true, accounts: [summary] }),
        getAccountToken: async () => {
          throw createHttpError(409, 'authorization_pending')
        },
      }),
      refreshTokenStore: createStore(),
      openExternal: async () => undefined,
    })

    await expect(service.login({ email: 'user@example.com', password: 'password' })).rejects.toThrow('request failed')
    expect(service.getAccessToken()).toBeNull()
    expect(service.getState().selectedAuthorizationId).toBeNull()
  })

  it('授权轮询返回 202 waiting/processing 时继续保留活动尝试，成功后刷新账号列表', async () => {
    const getLoginStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 'processing', attemptId: 'attempt-1' })
      .mockResolvedValueOnce({ ok: true, status: 'success', attemptId: 'attempt-1', authorization: summary })
    const listAccounts = vi.fn(async () => ({ ok: true, accounts: [summary] }))
    const service = createAuthService({
      oauth: createOAuth({
        login: async () => ({
          ok: true,
          user: { id: 'user-1', email: 'user@example.com', status: 'active' },
          accessToken: 'fixture',
          refreshToken: 'fixture',
        }),
        startLogin: async () => ({ ok: true, attemptId: 'attempt-1', authorizationUrl: 'https://example.com/oauth' }),
        getLoginStatus,
        listAccounts,
      }),
      refreshTokenStore: createStore(),
      openExternal: async () => undefined,
    })

    await service.login({ email: 'user@example.com', password: 'password' })
    await service.startLogin()
    await expect(service.getLoginStatus()).resolves.toMatchObject({ status: 'processing' })
    await expect(service.getLoginStatus()).resolves.toMatchObject({ status: 'success' })
    expect(listAccounts).toHaveBeenCalledTimes(2)
    expect(service.getState().selectedAuthorizationId).toBe('authorization-1')
  })

  it('授权结果明确失败时结束轮询并返回稳定状态', async () => {
    const service = createAuthService({
      oauth: createOAuth({
        login: async () => ({
          ok: true,
          user: { id: 'user-1', email: 'user@example.com', status: 'active' },
          accessToken: 'fixture',
          refreshToken: 'fixture',
        }),
        startLogin: async () => ({ ok: true, attemptId: 'attempt-1', authorizationUrl: 'https://example.com/oauth' }),
        getLoginStatus: async () => {
          throw createHttpError(400, 'failed')
        },
      }),
      refreshTokenStore: createStore(),
      openExternal: async () => undefined,
    })

    await service.login({ email: 'user@example.com', password: 'password' })
    await service.startLogin()
    await expect(service.getLoginStatus()).resolves.toMatchObject({ ok: false, status: 'failed' })
    await expect(service.getLoginStatus()).resolves.toMatchObject({ ok: true, status: 'idle' })
  })

  it('没有活动 OAuth 尝试时不会请求服务端', async () => {
    const getLoginStatus = vi.fn(async () => ({ ok: true, status: 'idle' }))
    const service = createAuthService({
      oauth: createOAuth({ getLoginStatus }),
      refreshTokenStore: createStore(),
      openExternal: async () => undefined,
    })

    await expect(service.getLoginStatus()).resolves.toMatchObject({ ok: true, status: 'idle' })
    expect(getLoginStatus).not.toHaveBeenCalled()
  })
})
