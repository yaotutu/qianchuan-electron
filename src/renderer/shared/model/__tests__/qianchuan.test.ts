import { describe, expect, it } from 'vitest'
import { authorizationSchema, promotionPlanResultSchema } from '../qianchuan'

describe('IPC 数据运行时校验', () => {
  it('把数字广告主 ID 统一转成字符串', () => {
    const result = authorizationSchema.parse({
      ok: true,
      status: 'success',
      token: { advertiserIds: [1842135619673292] },
    })
    expect(result.token?.advertiserIds).toEqual(['1842135619673292'])
  })

  it('保留计划业务字段并提供空列表默认值', () => {
    const result = promotionPlanResultSchema.parse({ ok: true, page: { total: 0 } })
    expect(result.plans).toEqual([])
  })
})
