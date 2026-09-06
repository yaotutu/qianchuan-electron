import { ZodError } from 'zod'

import { MonitorTaskValidationError } from '../monitor-task-store'
import { getRequestErrorDetails } from '../infrastructure/oauth-server-client'

/** 将异常转换成不包含 Token、Secret、Cookie 和本地路径的 IPC 响应。 */
export const toSafeError = (error: unknown) => {
  if (error instanceof ZodError) {
    return { ok: false, status: 'invalid_request', message: '请求参数格式无效，请刷新页面后重试。' }
  }
  if (error instanceof MonitorTaskValidationError) {
    return { ok: false, status: 'validation_error', message: error.message }
  }

  const details = getRequestErrorDetails(error)
  if (details.status === 503) {
    return {
      ok: false,
      status: 'server_unavailable',
      message: '登录服务暂未准备好，请稍后重试。',
    }
  }
  if (details.payload && [400, 401, 403, 502].includes(details.status || 0)) {
    return {
      ok: false,
      status: typeof details.payload.status === 'string' ? details.payload.status : 'error',
      message: typeof details.payload.message === 'string' ? details.payload.message : '服务端请求失败。',
      platformCode: details.payload.platformCode ?? null,
    }
  }
  return {
    ok: false,
    status: 'error',
    message: details.message || '请求服务端时发生未知错误。',
  }
}
