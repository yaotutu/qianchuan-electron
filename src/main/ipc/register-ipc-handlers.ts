import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../shared/contracts/ipc'
import {
  monitorAdvertiserIdSchema,
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
import { promotionPlanWriteInputSchema } from '../../shared/contracts/promotion-plan-write'
import { resultFromUnknownError } from '../../shared/contracts/result'
import {
  authorizationIdSchema,
  productCredentialsSchema,
  productRegisterInputSchema,
} from '../../shared/contracts/auth'
import type { AuthService } from '../application/auth-service'
import type { MonitorTaskService } from '../application/monitor-task-service'
import type { PromotionPlanService } from '../application/promotion-plan-service'
import type { UpdateService } from '../application/update-service'
import { toSafeError } from './safe-ipc-error'

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
  const handle =
    <T>(callback: (...args: unknown[]) => Promise<T>) =>
    async (...args: unknown[]) => {
      try {
        return await callback(...args)
      } catch (error) {
        return toSafeError(error)
      }
    }

  /** 列表接口先完成输入校验，再将所有异常收敛为 Result<T>，不再返回旧式错误对象。 */
  const handleResult =
    <T>(callback: (...args: unknown[]) => Promise<T>) =>
    async (...args: unknown[]) => {
      try {
        return await callback(...args)
      } catch (error) {
        return resultFromUnknownError(error)
      }
    }

  ipcMain.handle(
    IPC_CHANNELS.auth.getHealth,
    handle(() => authService.getHealth()),
  )
  ipcMain.handle(IPC_CHANNELS.appUpdate.getState, async () => updateService.getState())
  ipcMain.handle(
    IPC_CHANNELS.appUpdate.check,
    handle(() => updateService.checkForUpdates()),
  )
  ipcMain.handle(IPC_CHANNELS.appUpdate.install, async () => updateService.install())
  ipcMain.handle(
    IPC_CHANNELS.auth.restoreSession,
    handle(() => authService.restoreSession()),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.getState,
    handle(async () => authService.getState()),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.login,
    handle((_event, input: unknown) => authService.login(productCredentialsSchema.parse(input))),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.register,
    handle((_event, input: unknown) => authService.register(productRegisterInputSchema.parse(input))),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.logout,
    handle(() => authService.logout()),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.startLogin,
    handle(() => authService.startLogin()),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.getStatus,
    handle(() => authService.getLoginStatus()),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.selectAuthorization,
    handle((_event, authorizationId: unknown) =>
      authService.selectAuthorization(authorizationIdSchema.parse(authorizationId)),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.auth.deleteAuthorization,
    handle((_event, authorizationId: unknown) =>
      authService.deleteAuthorization(authorizationIdSchema.parse(authorizationId)),
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
    handle((_event, input: unknown) => promotionPlanService.update(promotionPlanWriteInputSchema.parse(input))),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.list,
    handle((_event, filters: unknown = {}) =>
      monitorTaskService.list(
        monitorTaskFiltersSchema.parse(filters === undefined ? {} : filters) as MonitorTaskStoreFilters,
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.create,
    handle((_event, input: unknown) =>
      monitorTaskService.create(monitorTaskCreateInputSchema.parse(input) as MonitorTaskCreateInput),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.update,
    handle((_event, taskId: unknown, input: unknown) =>
      monitorTaskService.update(monitorTaskIdSchema.parse(taskId), monitorTaskUpdateInputSchema.parse(input)),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.delete,
    handle((_event, taskId: unknown) => monitorTaskService.delete(monitorTaskIdSchema.parse(taskId))),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.batchStatus,
    handle((_event, taskIds: unknown, status: unknown) =>
      monitorTaskService.batchUpdateStatus(
        monitorTaskIdsSchema.parse(taskIds),
        monitorTaskStatusSchema.parse(status) as MonitorTaskStatus,
      ),
    ),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.batchDelete,
    handle((_event, taskIds: unknown) => monitorTaskService.batchDelete(monitorTaskIdsSchema.parse(taskIds))),
  )
  ipcMain.handle(
    IPC_CHANNELS.monitorTask.runNow,
    handle((_event, advertiserId: unknown) => monitorTaskService.runNow(monitorAdvertiserIdSchema.parse(advertiserId))),
  )
}
