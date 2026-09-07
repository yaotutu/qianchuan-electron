import { describe, expect, it, vi } from 'vitest'

import type { OAuthServerClient, OAuthServerRequestError } from '../../infrastructure/oauth-server-client'
import { createAuthService } from '../auth-service'

const createClient = (request: OAuthServerClient['request']): OAuthServerClient => ({ request })

const createHttpError = (status: number, payload: Record<string, unknown> = {}) => {
  const error = new Error('request failed') as OAuthServerRequestError
  error.status = status
  error.payload = payload
  return error
}

describe('授权应用服务', () => {
  it('发起登录后只向 Renderer 返回安全状态，并使用系统浏览器打开授权页', async () => {
    const openExternal = vi.fn(async () => undefined)
    const service = createAuthService({
      client: createClient(async () => ({
        ok: true,
        authorizationUrl: 'https://example.com/oauth',
        attemptId: 'attempt-1',
        expiresInSeconds: 300,
      })),
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
    const client = createClient(async (pathname) => {
      if (pathname === '/oauth/current') {
        return {
          ok: true,
          status: 'success',
          user: { displayName: '测试用户' },
          token: {
            accessToken: 'main-process-access-token',
            refreshToken: 'server-refresh-token',
            accessTokenExpiresAt: '2026-09-07T01:46:07.678Z',
            refreshTokenExpiresAt: '2026-10-06T01:46:07.678Z',
            advertiserIds: ['186001'],
            advertiserAccounts: [{ advertiserId: '186001', advertiserName: '知足好物集' }],
          },
        }
      }
      return { version: '1.0.0', configured: true, capabilities: ['oauth-attempt-result', 'current-authorization'] }
    })
    const service = createAuthService({ client, openExternal: async () => undefined })

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
    let resolveRequest: ((value: Record<string, unknown>) => void) | undefined
    const request = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const service = createAuthService({ client: createClient(request), openExternal: async () => undefined })

    const first = service.getCurrentAuthorization()
    const second = service.getCurrentAuthorization()
    expect(request).toHaveBeenCalledTimes(1)

    resolveRequest?.({
      ok: true,
      status: 'success',
      token: {
        accessToken: 'restored-access-token',
        refreshToken: 'server-only-refresh-token',
        advertiserIds: ['186001'],
      },
    })

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toEqual(secondResult)
    expect(service.getAccessToken()).toBe('restored-access-token')
  })

  it('平台明确拒绝旧 Access Token 时只强制刷新一次，并把新 Token 留在主进程', async () => {
    const request = vi.fn(async (pathname: string) => {
      if (pathname === '/oauth/current?force_refresh=true') {
        return {
          ok: true,
          status: 'success',
          token: {
            accessToken: 'fresh-access-token',
            refreshToken: 'server-only-refresh-token',
            advertiserIds: ['186001'],
          },
        }
      }
      throw new Error(`unexpected OAuth request: ${pathname}`)
    })
    const service = createAuthService({ client: createClient(request), openExternal: async () => undefined })

    await expect(service.refreshAccessToken()).resolves.toBe('fresh-access-token')
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/oauth/current?force_refresh=true')
    expect(service.getAccessToken()).toBe('fresh-access-token')
  })

  it('强制刷新失败时清空主进程中的旧 Access Token', async () => {
    const request = vi.fn(async (pathname: string) => {
      if (pathname === '/oauth/current') {
        return { ok: true, status: 'success', token: { accessToken: 'stale-access-token' } }
      }
      if (pathname === '/oauth/current?force_refresh=true') {
        throw createHttpError(401, { status: 'reauthorization_required' })
      }
      throw new Error(`unexpected OAuth request: ${pathname}`)
    })
    const service = createAuthService({ client: createClient(request), openExternal: async () => undefined })

    await service.getCurrentAuthorization()
    await expect(service.refreshAccessToken()).resolves.toBeNull()
    expect(service.getAccessToken()).toBeNull()
  })

  it('服务端返回无效授权时也不会向 Renderer 泄露 Refresh Token', async () => {
    const client = createClient(async (pathname) => {
      if (pathname === '/oauth/current') {
        return {
          ok: true,
          status: 'success',
          token: {
            refreshToken: 'server-refresh-token',
            accessTokenExpiresAt: '2026-09-07T01:46:07.678Z',
            advertiserIds: ['186001'],
          },
        }
      }
      return { version: '1.0.0', configured: true, capabilities: ['oauth-attempt-result', 'current-authorization'] }
    })
    const service = createAuthService({ client, openExternal: async () => undefined })

    const result = await service.getCurrentAuthorization()

    expect(result.token).not.toHaveProperty('refreshToken')
    if (result.token) {
      expect(result.token.accessTokenExpiresAt).toBe('2026-09-07T01:46:07.678Z')
      expect(result.token.advertiserIds).toEqual(['186001'])
    }
    expect(service.getAccessToken()).toBeNull()
  })

  it('把失效授权与服务端能力不完整转换成稳定客户端状态', async () => {
    const client = createClient(async (pathname) => {
      if (pathname === '/oauth/current') {
        throw createHttpError(401, { status: 'reauthorization_required' })
      }
      return { version: '1.0.0', configured: true, capabilities: ['oauth-attempt-result'] }
    })
    const service = createAuthService({ client, openExternal: async () => undefined })

    await expect(service.getCurrentAuthorization()).resolves.toMatchObject({
      ok: false,
      status: 'reauthorization_required',
    })
    await expect(service.getHealth()).resolves.toMatchObject({ ok: false, status: 'server_outdated' })
  })

  it('没有活动登录尝试时不会请求服务端', async () => {
    const request = vi.fn(async () => ({}))
    const service = createAuthService({ client: createClient(request), openExternal: async () => undefined })

    await expect(service.getLoginStatus()).resolves.toMatchObject({ ok: true, status: 'idle' })
    expect(request).not.toHaveBeenCalled()
  })
})
