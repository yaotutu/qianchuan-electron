import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }))

import { IPC_CHANNELS } from '../../../shared/contracts/ipc'
import type { AuthService } from '../../application/auth-service'
import type { MonitorTaskService } from '../../application/monitor-task-service'
import type { PromotionPlanService } from '../../application/promotion-plan-service'
import type { UpdateService } from '../../application/update-service'
import { registerIpcHandlers } from '../register-ipc-handlers'

const getHandler = (channel: string) => {
  const registration = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  if (!registration) throw new Error(`未注册 IPC channel: ${channel}`)
  return registration[1] as (...args: unknown[]) => Promise<unknown>
}

const createAuthService = (overrides: Partial<AuthService> = {}): AuthService =>
  ({
    startLogin: vi.fn(),
    getLoginStatus: vi.fn(),
    restoreSession: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getState: vi.fn(),
    listAccounts: vi.fn(),
    selectAuthorization: vi.fn(),
    deleteAuthorization: vi.fn(),
    refreshAccessToken: vi.fn(),
    getHealth: vi.fn(),
    getAccessToken: vi.fn(),
    getAdvertiserIds: vi.fn(),
    ...overrides,
  }) as AuthService

const createUpdateService = (overrides: Partial<UpdateService> = {}): UpdateService =>
  ({
    getState: vi.fn(),
    checkForUpdates: vi.fn(),
    install: vi.fn(),
    onStateChange: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  }) as UpdateService

const registerForTest = (authService: AuthService, updateService: UpdateService) =>
  registerIpcHandlers({
    authService,
    updateService,
    promotionPlanService: {} as PromotionPlanService,
    monitorTaskService: {} as MonitorTaskService,
  })

describe('认证和更新 IPC Result 边界', () => {
  beforeEach(() => {
    handleMock.mockReset()
  })

  it('把登录失败转换为 AUTHENTICATION_FAILED，而不是透传服务端旧 DTO', async () => {
    registerForTest(
      createAuthService({
        login: vi.fn(async () => ({ ok: false, message: '邮箱或密码错误' })),
      }),
      createUpdateService(),
    )

    await expect(
      getHandler(IPC_CHANNELS.auth.login)({}, { email: 'user@example.com', password: 'secret123' }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: '邮箱或密码错误',
        retryable: true,
      },
    })
  })

  it('把登录服务健康检查失败转换为 AUTH_SERVICE_UNAVAILABLE', async () => {
    registerForTest(
      createAuthService({
        getHealth: vi.fn(async () => ({ ok: false, message: '登录服务暂时不可用' })),
      }),
      createUpdateService(),
    )

    await expect(getHandler(IPC_CHANNELS.auth.getHealth)({})).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: '登录服务暂时不可用',
        retryable: true,
      },
    })
  })

  it('把授权发起失败转换为 AUTHORIZATION_FAILED', async () => {
    registerForTest(
      createAuthService({
        startLogin: vi.fn(async () => ({ ok: false, message: '无法打开授权页面' })),
      }),
      createUpdateService(),
    )

    await expect(getHandler(IPC_CHANNELS.auth.startLogin)({})).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUTHORIZATION_FAILED',
        message: '无法打开授权页面',
        retryable: true,
      },
    })
  })

  it('保留授权轮询的 failed/expired 业务状态在 data 中', async () => {
    registerForTest(
      createAuthService({
        getLoginStatus: vi.fn(async () => ({ ok: false, status: 'failed', message: '用户取消授权' })),
      }),
      createUpdateService(),
    )

    await expect(getHandler(IPC_CHANNELS.auth.getStatus)({})).resolves.toEqual({
      ok: true,
      data: {
        status: 'failed',
        message: '用户取消授权',
      },
    })
  })

  it('把更新状态查询包装成 Result<AppUpdateState>', async () => {
    registerForTest(
      createAuthService(),
      createUpdateService({
        getState: vi.fn(() => ({ status: 'up-to-date', currentVersion: '1.0.0', message: '当前已是最新版本。' })),
      }),
    )

    await expect(getHandler(IPC_CHANNELS.appUpdate.getState)({})).resolves.toEqual({
      ok: true,
      data: {
        status: 'up-to-date',
        currentVersion: '1.0.0',
        message: '当前已是最新版本。',
      },
    })
  })
})
