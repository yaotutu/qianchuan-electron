import { describe, expect, it, vi } from 'vitest'
import { createQianchuanApiClient, QianchuanApiError } from '../qianchuan-api-client'

describe('千川 OpenAPI 客户端', () => {
  it('POST 通过请求头传 Token，并序列化受控 JSON 载荷', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ code: 0, request_id: 'write-1' }), { status: 200 }),
    )
    const client = createQianchuanApiClient({ fetchImpl })
    const body = { advertiser_id: 186001, update_budget_infos: [{ ad_id: 9001, budget: 300 }] }
    await expect(
      client.post('https://api.oceanengine.com/open_api/test/', 'secret-token', body, '更新预算'),
    ).resolves.toMatchObject({ code: 0 })
    const [, init] = fetchImpl.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'Access-Token': 'secret-token', 'Content-Type': 'application/json' })
    expect(init?.body).toBe(JSON.stringify(body))
  })

  it('平台非零 code 转换为稳定错误', async () => {
    const client = createQianchuanApiClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ code: 40030, message: '拒绝', request_id: 'r-1' }), { status: 200 }),
    })
    await expect(
      client.post('https://api.oceanengine.com/open_api/test/', 'token', {}, '更新预算'),
    ).rejects.toBeInstanceOf(QianchuanApiError)
  })
})
