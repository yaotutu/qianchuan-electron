import { describe, expect, it, vi } from 'vitest'

import { createOAuthServerClient, getRequestErrorDetails } from '../oauth-server-client'

describe('OAuth 服务端 HTTP 客户端', () => {
  it('规范化基础地址并解析 JSON 响应', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const client = createOAuthServerClient({ baseUrl: 'http://127.0.0.1:3100///', fetchImpl })

    await expect(client.request('/health')).resolves.toEqual({ ok: true })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:3100/health')
  })

  it('保留服务端安全错误字段，供应用层做状态映射', async () => {
    const client = createOAuthServerClient({
      baseUrl: 'http://127.0.0.1:3100',
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: 'reauthorization_required', message: '需要重新授权' }), {
          status: 401,
        }),
    })

    try {
      await client.request('/oauth/current')
      throw new Error('预期请求失败')
    } catch (error) {
      expect(getRequestErrorDetails(error)).toMatchObject({
        status: 401,
        message: '需要重新授权',
        payload: { status: 'reauthorization_required' },
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

    await expect(offlineClient.request('/health')).rejects.toThrow('无法连接 OAuth 服务端')
    await expect(invalidJsonClient.request('/health')).rejects.toThrow('无法解析的数据')
  })
})
