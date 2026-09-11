import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../shared/contracts/ipc'
import {
  monitorAdvertiserIdSchema,
  monitorTaskBatchUpdateResultSchema,
  monitorTaskCreateResultSchema,
  monitorTaskDeleteResultSchema,
  monitorTaskListResultSchema,
  monitorTaskRunResultSchema,
  monitorTaskUpdateResultSchema,
  monitorTaskCreateInputSchema,
  monitorTaskFiltersSchema,
  monitorTaskIdSchema,
  monitorTaskIdsSchema,
  monitorTaskStatusSchema,
  monitorTaskUpdateInputSchema,
  type MonitorTaskCreateInput,
  type MonitorTaskStoreFilters,
  type MonitorTaskStatus,
  type MonitorTaskUpdateInput,
} from '../../shared/contracts/monitor-task'
import {
  promotionPlanDetailInputSchema,
  promotionPlanListInputSchema,
  promotionPlanMonitorSelectionInputSchema,
  promotionPlanListResultSchema,
  promotionPlanDetailResultSchema,
  type PromotionPlanDetailInput,
  type PromotionPlanListInput,
} from '../../shared/contracts/promotion-plan'
import {
  promotionPlanWriteInputSchema,
  promotionPlanWriteResultSchema,
} from '../../shared/contracts/promotion-plan-write'
import {
  failureResult,
  resultFromUnknownError,
  successResult,
  type ApplicationErrorCode,
} from '../../shared/contracts/result'
import {
  authActionResultSchema,
  authStateResultSchema,
  healthResultSchema,
  oauthLoginStatusResultSchema,
  authorizationIdSchema,
  productCredentialsSchema,
  productRegisterInputSchema,
} from '../../shared/contracts/auth'
import type { AuthService } from '../application/auth-service'
import type { MonitorTaskService } from '../application/monitor-task-service'
import type { PromotionPlanService } from '../application/promotion-plan-service'
import type { UpdateService } from '../application/update-service'

type RegisterIpcHandlersDependencies = {
  authService: AuthService
  promotionPlanService: PromotionPlanService
  monitorTaskService: MonitorTaskService
  updateService: UpdateService
}

/**
 * IPC 层只做参数接收、运行时结构校验、应用服务调用和安全错误转换。
 * 具体业务规则分别位于 application、infrastructure 和本地仓库中。
 *
 * Electron 的 IPC 参数并不会自动遵守 TypeScript 类型，因此这里必须对所有来自
 * Renderer 的对象、数组和 ID 再做一次 Zod 校验，不能把类型断言当成安全边界。
 */
export const registerIpcHandlers = ({
  authService,
  promotionPlanService,
  monitorTaskService,
  updateService,
}: RegisterIpcHandlersDependencies) => {
  /** 所有请求-响应型 IPC 都在这里收敛为同一种 Result<T>，避免 Renderer 适配多套历史协议。 */
  const handleResult =
    <T>(callback: (...args: unknown[]) => Promise<T>) =>
    async (...args: unknown[]) => {
      try {
        return await callback(...args)
      } catch (error) {
        return resultFromUnknownError(error)
      }
    }

  type LegacyActionResult = {
    ok: boolean
    status?: string
    message?: string
    retryAfterSeconds?: number
  }

  /**
   * 认证应用服务内部暂时保留服务端 DTO 的 ok 字段；它不能直接穿过 IPC。
   * 这里把成功数据放入 data，把真正失败转换为稳定的应用错误码。
   */
  const toAuthActionResult = (
    value: LegacyActionResult,
    failureCode: ApplicationErrorCode = 'AUTHENTICATION_FAILED',
  ) => {
    const { ok, ...data } = value
    return ok ? successResult(data) : failureResult(failureCode, value.message ?? '认证操作未完成，请稍后重试。', true)
  }

  const toHealthResult = (
    value: LegacyActionResult & {
      version?: string
      configured?: boolean
      databaseConnected?: boolean
    },
  ) => {
    const { ok, ...data } = value
    return ok
      ? successResult(data)
      : failureResult('AUTH_SERVICE_UNAVAILABLE', value.message ?? '登录服务暂未准备好，请稍后重试。', true)
  }

  /** 授权轮询中的 failed/expired 是业务状态，不是 IPC 传输失败，因此保留在 data 中。 */
  const toOAuthLoginStatusResult = (value: LegacyActionResult & { attemptId?: string; authorization?: unknown }) => {
    const { ok: _legacyOk, ...data } = value
    return successResult(data)
  }

  ipcMain.handle(
    IPC_CHANNELS.auth.getHealth,
    handleResult(async () => healthResultSchema.parse(toHealthResult(await authService.getHealth()))),
  )
  ipcMain.handle(
    IPC_CHANNELS.appUpdate.getState,
    handleResult(async () => successResult(updateService.getState())),
  )
  ipcMain.handle(
    IPC_CHANNELS.appUpdate.check,
    handleResult(async () => successResult(await updateService.checkForUpdates())),
  )
  ipcMain.handle(
    IPC_CHANNELS.appUpdate.install,
    handleResult(async () => successResult(updateService.install())),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.restoreSession,
    handleResult(async () => authStateResultSchema.parse(successResult(await authService.restoreSession()))),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.getState,
    handleResult(async () => authStateResultSchema.parse(successResult(authService.getState()))),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.login,
    handleResult(async (_event, input: unknown) =>
      authActionResultSchema.parse(toAuthActionResult(await authService.login(productCredentialsSchema.parse(input)))),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.register,
    handleResult(async (_event, input: unknown) =>
      authActionResultSchema.parse(
        toAuthActionResult(await authService.register(productRegisterInputSchema.parse(input))),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.logout,
    handleResult(async () => authActionResultSchema.parse(toAuthActionResult(await authService.logout()))),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.startLogin,
    handleResult(async () =>
      authActionResultSchema.parse(toAuthActionResult(await authService.startLogin(), 'AUTHORIZATION_FAILED')),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.getStatus,
    handleResult(async () =>
      oauthLoginStatusResultSchema.parse(toOAuthLoginStatusResult(await authService.getLoginStatus())),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.selectAuthorization,
    handleResult(async (_event, authorizationId: unknown) =>
      authStateResultSchema.parse(
        successResult(await authService.selectAuthorization(authorizationIdSchema.parse(authorizationId))),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.deleteAuthorization,
    handleResult(async (_event, authorizationId: unknown) =>
      authActionResultSchema.parse(
        toAuthActionResult(
          await authService.deleteAuthorization(authorizationIdSchema.parse(authorizationId)),
          'AUTHORIZATION_FAILED',
        ),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.promotionPlan.list,
    handleResult(async (_event, input: unknown = {}) =>
      promotionPlanListResultSchema.parse(
        await promotionPlanService.listResult(
          promotionPlanListInputSchema.parse(input === undefined ? {} : input) as PromotionPlanListInput,
        ),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.promotionPlan.findForMonitor,
    handleResult(async (_event, input: unknown = {}) =>
      promotionPlanListResultSchema.parse(
        await promotionPlanService.findPlansForMonitor(
          promotionPlanMonitorSelectionInputSchema.parse(input === undefined ? {} : input),
        ),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.promotionPlan.detail,
    handleResult(async (_event, input: unknown) =>
      promotionPlanDetailResultSchema.parse(
        await promotionPlanService.getDetailResult(
          promotionPlanDetailInputSchema.parse(input) as PromotionPlanDetailInput,
        ),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.promotionPlan.update,
    handleResult(async (_event, input: unknown) =>
      promotionPlanWriteResultSchema.parse(
        await promotionPlanService.update(promotionPlanWriteInputSchema.parse(input)),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.list,
    handleResult(async (_event, filters: unknown = {}) =>
      monitorTaskListResultSchema.parse(
        await monitorTaskService.list(
          monitorTaskFiltersSchema.parse(filters === undefined ? {} : filters) as MonitorTaskStoreFilters,
        ),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.create,
    handleResult(async (_event, input: unknown) =>
      monitorTaskCreateResultSchema.parse(
        await monitorTaskService.create(monitorTaskCreateInputSchema.parse(input) as MonitorTaskCreateInput),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.update,
    handleResult(async (_event, taskId: unknown, input: unknown) =>
      monitorTaskUpdateResultSchema.parse(
        await monitorTaskService.update(monitorTaskIdSchema.parse(taskId), monitorTaskUpdateInputSchema.parse(input)),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.delete,
    handleResult(async (_event, taskId: unknown) =>
      monitorTaskDeleteResultSchema.parse(await monitorTaskService.delete(monitorTaskIdSchema.parse(taskId))),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.batchStatus,
    handleResult(async (_event, taskIds: unknown, status: unknown) =>
      monitorTaskBatchUpdateResultSchema.parse(
        await monitorTaskService.batchUpdateStatus(
          monitorTaskIdsSchema.parse(taskIds),
          monitorTaskStatusSchema.parse(status) as MonitorTaskStatus,
        ),
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.batchDelete,
    handleResult(async (_event, taskIds: unknown) =>
      monitorTaskDeleteResultSchema.parse(await monitorTaskService.batchDelete(monitorTaskIdsSchema.parse(taskIds))),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.runNow,
    handleResult(async (_event, advertiserId: unknown) =>
      monitorTaskRunResultSchema.parse(await monitorTaskService.runNow(monitorAdvertiserIdSchema.parse(advertiserId))),
    ),
  )
}
