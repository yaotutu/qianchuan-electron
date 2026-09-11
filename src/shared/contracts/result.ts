import { z } from 'zod'

/**
 * 跨 IPC 返回的稳定错误分类。
 *
 * 错误码只表达应用层可处理的语义，不把 HTTP 状态码、平台内部 code
 * 或基础设施异常类型泄露给 Renderer。页面可以据此决定提示文案和是否允许重试。
 */
export const applicationErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_FAILED',
  'AUTH_SERVICE_UNAVAILABLE',
  'FORBIDDEN_ADVERTISER',
  'PLATFORM_RATE_LIMITED',
  'PLATFORM_UNAVAILABLE',
  'PLATFORM_BUSINESS_ERROR',
  'VALIDATION_FAILED',
  'CONFLICT',
  'LOCAL_STORAGE_FAILED',
  'INTERNAL_ERROR',
])

export type ApplicationErrorCode = z.infer<typeof applicationErrorCodeSchema>

export const applicationErrorSchema = z
  .object({
    code: applicationErrorCodeSchema,
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
  })
  .strip()

/** 成功和失败分支使用 discriminated union，避免页面根据可选字段猜测状态。 */
export const resultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema }).strip(),
    z.object({ ok: z.literal(false), error: applicationErrorSchema }).strip(),
  ])

export type Result<T> = { ok: true; data: T } | { ok: false; error: z.infer<typeof applicationErrorSchema> }

export const successResult = <T>(data: T): Result<T> => ({ ok: true, data })

export const failureResult = (code: ApplicationErrorCode, message: string, retryable = false): Result<never> => ({
  ok: false,
  error: { code, message, retryable },
})

/**
 * 将主进程内部异常转换成可安全跨进程传输的失败结果。
 * 这里只根据稳定的业务提示和有限的结构化字段分类，绝不把原始堆栈返回页面。
 */
export const resultFromUnknownError = (error: unknown): Result<never> => {
  const message = error instanceof Error ? error.message : ''
  const normalizedMessage = message.toLocaleLowerCase('zh-CN')
  const errorRecord = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const platformCode = String(errorRecord.platformCode ?? '')

  if (error instanceof z.ZodError || errorRecord.name === 'MonitorTaskValidationError') {
    return failureResult(
      'VALIDATION_FAILED',
      errorRecord.name === 'MonitorTaskValidationError' && message ? message : '请求参数格式无效，请刷新页面后重试。',
    )
  }
  if (/本地监控任务|本地存储|monitor.?task.*storage/u.test(message)) {
    return failureResult('LOCAL_STORAGE_FAILED', '本地监控任务数据暂时不可用，请重启应用后重试。', true)
  }
  if (/当前未登录|请先完成.*授权|unauthorized|未授权/u.test(message)) {
    return failureResult('UNAUTHORIZED', '当前未登录，请先完成巨量千川授权。')
  }
  if (/无权查询|广告主.*无权|forbidden/u.test(message)) {
    return failureResult('FORBIDDEN_ADVERTISER', '无权查询该广告主账号。')
  }
  if (['401', '40105', '40106'].includes(platformCode)) {
    return failureResult('UNAUTHORIZED', '当前授权已失效，请重新完成巨量千川授权。')
  }
  if (platformCode === '403') {
    return failureResult('FORBIDDEN_ADVERTISER', '当前授权无权访问该广告主或接口权限不足。')
  }
  if (platformCode === '429' || /限流|rate.?limit|too many requests/u.test(normalizedMessage)) {
    return failureResult('PLATFORM_RATE_LIMITED', '平台请求过于频繁，请稍后重试。', true)
  }
  if (
    /登录服务请求失败|登录服务.*不可用|oauth.*服务|网络请求失败|返回内容不是合法 json|服务不可用|network|timeout|超时/u.test(
      normalizedMessage,
    )
  ) {
    if (/登录服务|oauth/u.test(normalizedMessage)) {
      return failureResult('AUTH_SERVICE_UNAVAILABLE', '登录服务暂时不可用，请稍后重试。', true)
    }
    return failureResult('PLATFORM_UNAVAILABLE', '千川平台暂时不可用，请稍后重试。', true)
  }
  if (/被平台拒绝|平台.*异常|平台.*失败|http 状态异常|业务错误/u.test(message)) {
    return failureResult('PLATFORM_BUSINESS_ERROR', '千川平台未完成本次查询，请检查授权和查询条件后重试。')
  }
  if (/冲突|已被.*更新|snapshot/u.test(normalizedMessage)) {
    return failureResult('CONFLICT', '数据已发生变化，请刷新后重试。')
  }

  return failureResult('INTERNAL_ERROR', '读取数据时发生未知错误，请稍后重试。')
}
