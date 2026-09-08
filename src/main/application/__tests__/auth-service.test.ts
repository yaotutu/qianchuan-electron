import { describe, expect, it, vi } from 'vitest'

import type { OAuthCapabilities, OAuthCapabilityError } from '../capabilities/oauth'
import { createAuthService } from '../auth-service'

const createOAuth = (overrides: Partial<OAuthCapabilities> = {}): OAuthCapabilities => ({
  startLogin: async () => ({}),
  getLoginStatus: async () => ({}),
  getCurrentAuthorization: async () => ({}),
  getHealth: async () => ({}),
  ...overrides,
})

const createHttpError = (status: number, payloadStatus?: string) => {
  const error = new Error('request failed') as OAuthCapabilityError
  Object.assign(error, { kind: 'oauth_capability_error' as const, status, payloadStatus })
  return error
}

describe('授权应用服务', () => {
  it('发起登录后只向 Renderer 返回安全状态，并使用系统浏览器打开授权页', async () => {
    const openExternal = vi.fn(async () => undefined)
    const service = createAuthService({
      oauth: createOAuth({
        startLogin: async () => ({
          ok: true,
          authorizationUrl: 'https://example.com/oauth',
          attemptId: 'attempt-1',
          expiresInSeconds: 300,
        }),
      }),
      openExternal,
      now: () => new Date('2026-09-06T01:00:00.000Z'),
    })

    await expect(service.startLogin()).resolves.toEqual({
      ok: true,
      status: 'waiting',
      startedAt: '2026-09-06T01:00:00.000Z',
      expiresInSeconds: 300,
      message: '已打开巨量授权页面，请在浏览器中完成授权。',
    })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth')
  })

  it('当前授权只返回 Renderer 需要的字段，Token 原文留在主进程缓存', async () => {
    const service = createAuthService({
      oauth: createOAuth({
        getCurrentAuthorization: async () => ({
          ok: true,
          status: 'success',
          user: { displayName: '测试用户' },
          token: {
            accessToken: 'main-process-access-token',
            accessTokenExpiresAt: '2026-09-07T01:46:07.678Z',
            refreshTokenExpiresAt: '2026-10-06T01:46:07.678Z',
            advertiserIds: ['186001'],
            advertiserAccounts: [{ advertiserId: '186001', advertiserName: '知足好物集' }],
          },
        }),
      }),
      openExternal: async () => undefined,
    })

    const result = await service.getCurrentAuthorization()

    expect(result.token).not.toHaveProperty('accessToken')
    expect(result.token).not.toHaveProperty('refreshToken')
    if (result.token) {
      expect(result.token.accessTokenExpiresAt).toBe('2026-09-07T01:46:07.678Z')
      expect(result.token.advertiserIds).toEqual(['186001'])
      expect(result.token.advertiserAccounts).toEqual([{ advertiserId: '186001', advertiserName: '知足好物集' }])
    }
    expect(service.getAccessToken()).toBe('main-process-access-token')
    expect(service.getAdvertiserIds()).toEqual(['186001'])
  })

  it('并发恢复授权时只请求一次 OAuth 服务端，避免重复刷新 Refresh Token', async () => {
    let resolveRequest: ((value: Awaited<ReturnType<OAuthCapabilities['getCurrentAuthorization']>>) => void) | undefined
    const getCurrentAuthorization = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<OAuthCapabilities['getCurrentAuthorization']>>>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const service = createAuthService({
      oauth: createOAuth({ getCurrentAuthorization }),
      openExternal: async () => undefined,
    })

    const first = service.getCurrentAuthorization()
    const second = service.getCurrentAuthorization()
    expect(getCurrentAuthorization).toHaveBeenCalledTimes(1)

    resolveRequest?.({
      ok: true,
      status: 'success',
      token: {
        accessToken: 'restored-access-token',
        advertiserIds: ['186001'],
      },
    })

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toEqual(secondResult)
    expect(service.getAccessToken()).toBe('restored-access-token')
  })

  it('平台明确拒绝旧 Access Token 时只强制刷新一次，并把新 Token 留在主进程', async () => {
    const getCurrentAuthorization = vi.fn(async ({ forceRefresh = false } = {}) => {
      if (forceRefresh) {
        return {
          ok: true,
          status: 'success',
          token: {
            accessToken: 'fresh-access-token',
            advertiserIds: ['186001'],
          },
        }
      }
      throw new Error('unexpected OAuth request')
    })
    const service = createAuthService({
      oauth: createOAuth({ getCurrentAuthorization }),
      openExternal: async () => undefined,
    })

    await expect(service.refreshAccessToken()).resolves.toBe('fresh-access-token')
    expect(getCurrentAuthorization).toHaveBeenCalledTimes(1)
    expect(getCurrentAuthorization).toHaveBeenCalledWith({ forceRefresh: true })
    expect(service.getAccessToken()).toBe('fresh-access-token')
  })

  it('强制刷新失败时清空主进程中的旧 Access Token', async () => {
    const getCurrentAuthorization = vi.fn(async ({ forceRefresh = false } = {}) => {
      if (!forceRefresh) return { ok: true, status: 'success', token: { accessToken: 'stale-access-token' } }
      throw createHttpError(401, 'reauthorization_required')
    })
    const service = createAuthService({
      oauth: createOAuth({ getCurrentAuthorization }),
      openExternal: async () => undefined,
    })

    await service.getCurrentAuthorization()
    await expect(service.refreshAccessToken()).resolves.toBeNull()
    expect(service.getAccessToken()).toBeNull()
  })

  it('服务端返回无效授权时也不会向 Renderer 泄露 Refresh Token', async () => {
    const service = createAuthService({
      oauth: createOAuth({
        getCurrentAuthorization: async () => ({
          ok: true,
          status: 'success',
          token: {
            accessTokenExpiresAt: '2026-09-07T01:46:07.678Z',
            advertiserIds: ['186001'],
          },
        }),
      }),
      openExternal: async () => undefined,
    })

    const result = await service.getCurrentAuthorization()

    expect(result.token).not.toHaveProperty('refreshToken')
    if (result.token) {
      expect(result.token.accessTokenExpiresAt).toBe('2026-09-07T01:46:07.678Z')
      expect(result.token.advertiserIds).toEqual(['186001'])
    }
    expect(service.getAccessToken()).toBeNull()
  })

  it('把失效授权与服务端能力不完整转换成稳定客户端状态', async () => {
    const service = createAuthService({
      oauth: createOAuth({
        getCurrentAuthorization: async () => {
          throw createHttpError(401, 'reauthorization_required')
        },
        getHealth: async () => ({ version: '1.0.0', configured: true, capabilities: ['oauth-attempt-result'] }),
      }),
      openExternal: async () => undefined,
    })

    await expect(service.getCurrentAuthorization()).resolves.toMatchObject({
      ok: false,
      status: 'reauthorization_required',
    })
    await expect(service.getHealth()).resolves.toMatchObject({ ok: false, status: 'server_outdated' })
  })

  it('授权轮询请求已过期时清理活动尝试并返回稳定状态', async () => {
    const getLoginStatus = vi.fn(async () => {
      throw createHttpError(404)
    })
    const service = createAuthService({
      oauth: createOAuth({
        startLogin: async () => ({ ok: true, authorizationUrl: 'https://example.com/oauth', attemptId: 'attempt-1' }),
        getLoginStatus,
      }),
      openExternal: async () => undefined,
    })

    await service.startLogin()
    await expect(service.getLoginStatus()).resolves.toEqual({
      ok: false,
      status: 'expired',
      message: '本次登录请求已经失效，请重新登录。',
    })
    await expect(service.getLoginStatus()).resolves.toMatchObject({ ok: true, status: 'idle' })
    expect(getLoginStatus).toHaveBeenCalledTimes(1)
  })

  it('没有活动登录尝试时不会请求服务端', async () => {
    const getLoginStatus = vi.fn(async () => ({}))
    const service = createAuthService({
      oauth: createOAuth({ getLoginStatus }),
      openExternal: async () => undefined,
    })

    await expect(service.getLoginStatus()).resolves.toMatchObject({ ok: true, status: 'idle' })
    expect(getLoginStatus).not.toHaveBeenCalled()
  })
})
