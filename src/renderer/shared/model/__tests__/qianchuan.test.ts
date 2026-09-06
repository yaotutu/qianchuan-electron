import { describe, expect, it } from 'vitest'
import { normalizeClientRequestError } from '../../api/qianchuan-api'
import { authorizationSchema, monitorTaskListResultSchema, promotionPlanResultSchema } from '../qianchuan'

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

describe('客户端桥接错误提示', () => {
  it('把主进程 IPC 版本不一致转换成可执行提示', () => {
    const error = normalizeClientRequestError(
      new Error("Error invoking remote method 'monitor-tasks:list': No handler registered"),
      '读取本地监控任务',
    )
    expect(error.message).toContain('主进程尚未同步')
    expect(error.message).toContain('重启应用')
  })

  it('不把 Zod 数据结构细节直接展示给用户', () => {
    let schemaError: unknown
    try {
      monitorTaskListResultSchema.parse({ ok: true, tasks: [{ id: 1 }] })
    } catch (error) {
      schemaError = error
    }
    expect(normalizeClientRequestError(schemaError, '读取本地监控任务').message).toBe(
      '读取本地监控任务返回的数据格式与当前客户端不兼容，请重启应用。',
    )
  })
})
