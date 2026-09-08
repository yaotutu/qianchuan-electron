import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }))

import { IPC_CHANNELS } from '../../../shared/contracts/ipc'
import { registerIpcHandlers } from '../register-ipc-handlers'

const getHandler = (channel: string) => {
  const registration = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  if (!registration) throw new Error(`未注册 IPC channel: ${channel}`)
  return registration[1] as (...args: unknown[]) => Promise<unknown>
}

describe('IPC 输入边界', () => {
  beforeEach(() => {
    handleMock.mockReset()
  })

  it('拒绝类型错误的 Renderer 参数，不调用应用服务', async () => {
    const create = vi.fn()
    registerIpcHandlers({
      authService: {
        startLogin: vi.fn(),
        getLoginStatus: vi.fn(),
        getCurrentAuthorization: vi.fn(),
        getHealth: vi.fn(),
        getAccessToken: vi.fn(),
        getAdvertiserIds: vi.fn(),
      },
      promotionPlanService: { list: vi.fn(), getDetail: vi.fn(), getAllForMonitor: vi.fn() },
      monitorTaskService: {
        list: vi.fn(),
        create,
        update: vi.fn(),
        delete: vi.fn(),
        batchUpdateStatus: vi.fn(),
        batchDelete: vi.fn(),
        runNow: vi.fn(),
      },
    })

    await expect(getHandler(IPC_CHANNELS.monitorTask.create)({}, { plans: 'not-an-array' })).resolves.toEqual({
      ok: false,
      status: 'invalid_request',
      message: '请求参数格式无效，请刷新页面后重试。',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('剔除计划查询中的未声明字段后再调用服务', async () => {
    const list = vi.fn(async () => ({ ok: true }))
    registerIpcHandlers({
      authService: {
        startLogin: vi.fn(),
        getLoginStatus: vi.fn(),
        getCurrentAuthorization: vi.fn(),
        getHealth: vi.fn(),
        getAccessToken: vi.fn(),
        getAdvertiserIds: vi.fn(),
      },
      promotionPlanService: { list, getDetail: vi.fn(), getAllForMonitor: vi.fn() },
      monitorTaskService: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        batchUpdateStatus: vi.fn(),
        batchDelete: vi.fn(),
        runNow: vi.fn(),
      },
    })

    await getHandler(IPC_CHANNELS.promotionPlan.list)({}, { advertiserId: '186001', unsafe: 'value' })
    expect(list).toHaveBeenCalledWith({ advertiserId: '186001' })
  })
})

it('校验计划详情输入后再调用应用服务', async () => {
  const getDetail = vi.fn(async () => ({ ok: true }))
  registerIpcHandlers({
    authService: {
      startLogin: vi.fn(),
      getLoginStatus: vi.fn(),
      getCurrentAuthorization: vi.fn(),
      getHealth: vi.fn(),
      getAccessToken: vi.fn(),
      getAdvertiserIds: vi.fn(),
    },
    promotionPlanService: { list: vi.fn(), getDetail, getAllForMonitor: vi.fn() },
    monitorTaskService: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      batchUpdateStatus: vi.fn(),
      batchDelete: vi.fn(),
      runNow: vi.fn(),
    },
  })

  await getHandler(IPC_CHANNELS.promotionPlan.detail)({}, { advertiserId: '186001', adId: '9001', unsafe: 'drop' })

  expect(getDetail).toHaveBeenCalledWith({ advertiserId: '186001', adId: '9001' })
})
