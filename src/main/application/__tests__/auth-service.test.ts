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
