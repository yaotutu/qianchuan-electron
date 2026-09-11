import { describe, expect, it, vi } from 'vitest'

import { getOAuthCapabilityErrorDetails } from '../../application/capabilities/oauth'
import { createOAuthServerClient } from '../oauth-server-client'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('OAuth 服务端 HTTP 客户端', () => {
  it('使用 /health/ready 解析新版就绪检查结果', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        status: 'ready',
        version: '1.0.0',
        configured: true,
        databaseConnected: true,
      }),
    )
    const client = createOAuthServerClient({ baseUrl: 'http://127.0.0.1:3100///', fetchImpl })

    await expect(client.getHealth()).resolves.toEqual({
      ok: true,
      status: 'ready',
      version: '1.0.0',
      configured: true,
      databaseConnected: true,
      message: undefined,
    })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3100/health/ready')
  })

  it('以新版 JSON body 和 Bearer 认证调用登录、注册、刷新及 OAuth 启动接口', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) {
        return jsonResponse({
          ok: true,
          user: { id: 'user-1', email: 'user@example.com', status: 'active' },
          tokens: { accessToken: 'fixture', refreshToken: 'fixture' },
        })
      }
      if (url.endsWith('/auth/register')) {
        return jsonResponse(
          {
            ok: true,
            user: { id: 'user-1', email: 'user@example.com', status: 'active' },
            tokens: { accessToken: 'fixture', refreshToken: 'fixture' },
          },
          201,
        )
      }
      if (url.endsWith('/auth/refresh'))
        return jsonResponse({ ok: true, tokens: { accessToken: 'fixture', refreshToken: 'fixture' } })
      return jsonResponse({ ok: true, attemptId: 'attempt-1', authorizationUrl: 'https://example.com/oauth' })
    })
    const client = createOAuthServerClient({ baseUrl: 'http://127.0.0.1:3100', fetchImpl })

    await client.login({ email: 'user@example.com', password: 'password' })
    await client.register({ email: 'user@example.com', password: 'password', verificationCode: '6666' })
    await client.refreshProductSession('fixture')
    await client.startLogin('fixture')

    expect(fetchImpl).toHaveBeenCalledTimes(4)
    const loginInit = fetchImpl.mock.calls[0]?.[1] as RequestInit
    expect(loginInit.method).toBe('POST')
    expect(JSON.parse(String(loginInit.body))).toEqual({ email: 'user@example.com', password: 'password' })
    const registerInit = fetchImpl.mock.calls[1]?.[1] as RequestInit
    expect(JSON.parse(String(registerInit.body))).toEqual({
      email: 'user@example.com',
      password: 'password',
      verificationCode: '6666',
    })
    const refreshInit = fetchImpl.mock.calls[2]?.[1] as RequestInit
    expect(JSON.parse(String(refreshInit.body))).toEqual({ refreshToken: 'fixture' })
    const startInit = fetchImpl.mock.calls[3]?.[1] as RequestInit
    expect(startInit.headers).toMatchObject({ Authorization: 'Bearer fixture' })
    expect(startInit.method).toBe('POST')
  })

  it('解析多账号、授权处理中 202 和指定授权 Token 响应', async () => {
    const summary = {
      authorizationId: 'authorization-1',
      status: 'active',
      advertiserSyncStatus: 'success',
      user: { id: 'platform-user-1', displayName: '千川用户', email: 'platform@example.com' },
      advertiserIds: ['186001'],
      advertiserAccounts: [{ advertiserId: '186001', advertiserName: '测试账户' }],
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: 'waiting', attemptId: 'attempt-1' }, 202))
      .mockResolvedValueOnce(jsonResponse({ ok: true, accounts: [summary] }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          authorization: { ...summary, accessToken: 'fixture', accessTokenExpiresAt: '2026-09-08T12:00:00.000Z' },
        }),
      )
    const client = createOAuthServerClient({ baseUrl: 'http://127.0.0.1:3100', fetchImpl })

    await expect(client.getLoginStatus('fixture', 'attempt-1')).resolves.toMatchObject({
      ok: true,
      status: 'waiting',
      attemptId: 'attempt-1',
    })
    await expect(client.listAccounts('fixture')).resolves.toEqual({ ok: true, accounts: [summary], message: undefined })
    await expect(client.getAccountToken('fixture', 'authorization-1')).resolves.toMatchObject({
      ...summary,
      accessToken: 'fixture',
      accessTokenExpiresAt: '2026-09-08T12:00:00.000Z',
    })

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3100/oauth/result?attempt_id=attempt-1')
    expect((fetchImpl.mock.calls[2]?.[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer fixture' })
  })

  it('保留需要重新授权的账号，避免把服务端有效状态静默丢弃', async () => {
    const account = {
      authorizationId: 'authorization-expired',
      status: 'reauthorization_required',
      advertiserSyncStatus: 'success',
      user: { id: 'platform-user-expired', displayName: '待重新授权账号' },
      advertiserIds: [],
      advertiserAccounts: [],
    }
    const client = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () => jsonResponse({ ok: true, accounts: [account] }),
    })

    await expect(client.listAccounts('fixture')).resolves.toEqual({ ok: true, accounts: [account], message: undefined })
  })

  it('保留 HTTP 状态和服务端业务状态，供应用层区分 401、409 等场景', async () => {
    const client = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () =>
        jsonResponse({ ok: false, status: 'authorization_pending', message: '授权仍在补全中' }, 409),
    })

    await expect(client.getAccountToken('fixture', 'authorization-1')).rejects.toSatisfy((error: unknown) => {
      expect(getOAuthCapabilityErrorDetails(error)).toEqual({
        status: 409,
        message: '授权仍在补全中',
        payloadStatus: 'authorization_pending',
      })
      return true
    })
  })

  it('网络失败和非 JSON 响应都转换成不泄露请求细节的中文错误', async () => {
    const offlineClient = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () => {
        throw new Error('socket details')
      },
    })
    const invalidJsonClient = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () => new Response('not-json', { status: 200 }),
    })
    const missingEndpointClient = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () => new Response('Not Found', { status: 404 }),
    })

    await expect(offlineClient.getHealth()).rejects.toThrow('无法连接登录服务')
    await expect(invalidJsonClient.getHealth()).rejects.toThrow('无法解析的数据')
    await expect(missingEndpointClient.getHealth()).rejects.toThrow('登录服务请求失败（HTTP 404）')
  })
})
