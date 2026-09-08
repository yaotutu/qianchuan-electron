import { describe, expect, it, vi } from 'vitest'

import { getOAuthCapabilityErrorDetails } from '../../application/capabilities/oauth'
import { createOAuthServerClient } from '../oauth-server-client'

describe('OAuth 服务端 HTTP 客户端', () => {
  it('规范化基础地址并解析健康检查结果', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, version: '1.0.0', configured: true, capabilities: ['current-authorization'] }),
          {
            status: 200,
          },
        ),
    )
    const client = createOAuthServerClient({ baseUrl: 'http://127.0.0.1:3100///', fetchImpl })

    await expect(client.getHealth()).resolves.toEqual({
      ok: true,
      version: '1.0.0',
      configured: true,
      capabilities: ['current-authorization'],
      missingConfig: [],
      status: undefined,
      message: undefined,
      errorDescription: undefined,
    })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:3100/health')
  })

  it('把登录结果映射为应用能力，并保留安全业务字段', async () => {
    const client = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            status: 'success',
            token: {
              access_token: 'main-process-token',
              advertiser_ids: [186001],
              advertiser_accounts: [{ advertiser_id: 186001, advertiser_name: '测试账户' }],
            },
          }),
          { status: 200 },
        ),
    })

    await expect(client.getCurrentAuthorization()).resolves.toMatchObject({
      ok: true,
      status: 'success',
      token: {
        accessToken: 'main-process-token',
        advertiserIds: ['186001'],
        advertiserAccounts: [{ advertiserId: '186001', advertiserName: '测试账户' }],
      },
    })
  })

  it('保留稳定 HTTP 错误分类，供应用层做状态映射', async () => {
    const client = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: 'reauthorization_required', message: '需要重新授权' }), {
          status: 401,
        }),
    })

    try {
      await client.getCurrentAuthorization()
      throw new Error('预期请求失败')
    } catch (error) {
      expect(getOAuthCapabilityErrorDetails(error)).toEqual({
        status: 401,
        message: '需要重新授权',
        payloadStatus: 'reauthorization_required',
      })
    }
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

    await expect(offlineClient.getHealth()).rejects.toThrow('无法连接 OAuth 服务端')
    await expect(invalidJsonClient.getHealth()).rejects.toThrow('无法解析的数据')
  })
})
