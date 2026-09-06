import { describe, expect, it } from 'vitest'
import { ZodError, z } from 'zod'
import { normalizeClientRequestError } from '../qianchuan-api'

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
      z.object({ ok: z.boolean() }).parse({ ok: 'yes' })
    } catch (error) {
      schemaError = error
    }
    expect(schemaError).toBeInstanceOf(ZodError)
    expect(normalizeClientRequestError(schemaError, '读取本地监控任务').message).toBe(
      '读取本地监控任务返回的数据格式与当前客户端不兼容，请重启应用。',
    )
  })
})
