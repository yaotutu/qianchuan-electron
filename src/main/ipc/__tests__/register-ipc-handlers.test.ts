import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }))

import { IPC_CHANNELS } from '../../../shared/contracts/ipc'
import { registerIpcHandlers } from '../register-ipc-handlers'
import type { PromotionPlanService } from '../../application/promotion-plan-service'

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
      promotionPlanService: {
        list: vi.fn(),
        listResult: vi.fn(),
        findPlansForMonitor: vi.fn(),
        getDetail: vi.fn(),
        getAllForMonitor: vi.fn(),
      },
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
    const listResult = vi.fn(async () => ({ ok: true as const, data: { advertiserId: '186001', plans: [] } }))
    registerIpcHandlers({
      authService: {
        startLogin: vi.fn(),
        getLoginStatus: vi.fn(),
        getCurrentAuthorization: vi.fn(),
        getHealth: vi.fn(),
        getAccessToken: vi.fn(),
        getAdvertiserIds: vi.fn(),
      },
      promotionPlanService: {
        list: vi.fn(),
        listResult,
        findPlansForMonitor: vi.fn(),
        getDetail: vi.fn(),
        getAllForMonitor: vi.fn(),
      },
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
    expect(listResult).toHaveBeenCalledWith({ advertiserId: '186001' })
  })
})

it('校验计划详情输入后再调用应用服务', async () => {
  const getDetailResult = vi.fn(async () => ({
    ok: true as const,
    data: {
      snapshot: {
        snapshotId: '9001:detail',
        fetchedAt: '2026-09-08T00:00:00.000Z',
        source: 'OCEANENGINE_OPEN_API' as const,
        version: 1,
        contentHash: 'a'.repeat(64),
        identity: { advertiserId: '186001', adId: '9001' },
        delivery: {},
        products: [],
        accounts: [],
        rooms: [],
        creative: {
          selectedStarProductIds: [],
          videoCount: 0,
          imageCount: 0,
          titleCount: 0,
          carouselCount: 0,
          blockedMaterialCount: 0,
          titles: [],
        },
        advanced: { overallRoiCostItems: [] },
        capabilities: {
          canEnable: false,
          canDisable: false,
          canDelete: false,
          canUpdateBudget: false,
          canUpdateRoi: false,
          canUpdateName: false,
          canUpdateSchedule: false,
          canUpdateFullConfig: false,
          reasons: [],
        },
      },
    },
  }))
  registerIpcHandlers({
    authService: {
      startLogin: vi.fn(),
      getLoginStatus: vi.fn(),
      getCurrentAuthorization: vi.fn(),
      getHealth: vi.fn(),
      getAccessToken: vi.fn(),
      getAdvertiserIds: vi.fn(),
    },
    promotionPlanService: {
      list: vi.fn(),
      listResult: vi.fn(),
      findPlansForMonitor: vi.fn(),
      getDetail: vi.fn(),
      getDetailResult,
      getAllForMonitor: vi.fn(),
    },
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

  expect(getDetailResult).toHaveBeenCalledWith({ advertiserId: '186001', adId: '9001' })
})

describe('计划详情 Result IPC', () => {
  beforeEach(() => {
    handleMock.mockReset()
  })

  const registerWithDetailResult = (getDetailResult: PromotionPlanService['getDetailResult']) =>
    registerIpcHandlers({
      authService: {
        startLogin: vi.fn(),
        getLoginStatus: vi.fn(),
        getCurrentAuthorization: vi.fn(),
        getHealth: vi.fn(),
        getAccessToken: vi.fn(),
        getAdvertiserIds: vi.fn(),
      },
      promotionPlanService: {
        list: vi.fn(),
        listResult: vi.fn(),
        findPlansForMonitor: vi.fn(),
        getDetail: vi.fn(),
        getDetailResult,
        getAllForMonitor: vi.fn(),
      },
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

  it('详情输入非法时返回 VALIDATION_FAILED，不调用应用服务', async () => {
    const getDetailResult = vi.fn()
    registerWithDetailResult(getDetailResult)

    await expect(
      getHandler(IPC_CHANNELS.promotionPlan.detail)({}, { advertiserId: '186001', adId: 'not-a-number' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED', retryable: false },
    })
    expect(getDetailResult).not.toHaveBeenCalled()
  })

  it('详情结果只向 Renderer 暴露白名单快照，不透传未知字段', async () => {
    const getDetailResult = vi.fn(async () => ({
      ok: true as const,
      data: {
        snapshot: {
          snapshotId: '9001:detail',
          fetchedAt: '2026-09-08T00:00:00.000Z',
          source: 'OCEANENGINE_OPEN_API' as const,
          version: 1 as const,
          contentHash: 'a'.repeat(64),
          identity: { advertiserId: '186001', adId: '9001', unsafe: 'drop' },
          delivery: {},
          products: [],
          accounts: [],
          rooms: [],
          creative: {
            selectedStarProductIds: [],
            videoCount: 0,
            imageCount: 0,
            titleCount: 0,
            carouselCount: 0,
            blockedMaterialCount: 0,
            titles: [],
            unsafe: 'drop',
          },
          advanced: { overallRoiCostItems: [] },
          capabilities: {
            canEnable: false,
            canDisable: false,
            canDelete: false,
            canUpdateBudget: false,
            canUpdateRoi: false,
            canUpdateName: false,
            canUpdateSchedule: false,
            canUpdateFullConfig: false,
            reasons: [],
          },
          unsafe: 'drop',
        },
      },
      unsafe: 'drop',
    }))
    registerWithDetailResult(getDetailResult)

    await expect(
      getHandler(IPC_CHANNELS.promotionPlan.detail)({}, { advertiserId: '186001', adId: '9001' }),
    ).resolves.toEqual({
      ok: true,
      data: {
        snapshot: expect.objectContaining({
          identity: { advertiserId: '186001', adId: '9001' },
        }),
      },
    })
  })
})

describe('监控候选计划 Result IPC', () => {
  beforeEach(() => {
    handleMock.mockReset()
  })

  it('只向应用服务传递监控业务输入，不让 Renderer 控制平台分页', async () => {
    const findPlansForMonitor = vi.fn(async () => ({ ok: true as const, data: { advertiserId: '186001', plans: [] } }))
    registerIpcHandlers({
      authService: {
        startLogin: vi.fn(),
        getLoginStatus: vi.fn(),
        getCurrentAuthorization: vi.fn(),
        getHealth: vi.fn(),
        getAccessToken: vi.fn(),
        getAdvertiserIds: vi.fn(),
      },
      promotionPlanService: {
        list: vi.fn(),
        listResult: vi.fn(),
        findPlansForMonitor,
        getDetail: vi.fn(),
        getDetailResult: vi.fn(),
        getAllForMonitor: vi.fn(),
      },
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

    await getHandler(IPC_CHANNELS.promotionPlan.findForMonitor)(
      {},
      {
        advertiserId: '186001',
        scene: 'UNI_PROJECT',
        pageSize: 1,
      },
    )

    expect(findPlansForMonitor).toHaveBeenCalledWith({ advertiserId: '186001', scene: 'UNI_PROJECT' })
  })
})

describe('计划列表 Result IPC', () => {
  beforeEach(() => {
    handleMock.mockReset()
  })

  const registerWithListResult = (listResult: PromotionPlanService['listResult']) =>
    registerIpcHandlers({
      authService: {
        startLogin: vi.fn(),
        getLoginStatus: vi.fn(),
        getCurrentAuthorization: vi.fn(),
        getHealth: vi.fn(),
        getAccessToken: vi.fn(),
        getAdvertiserIds: vi.fn(),
      },
      promotionPlanService: {
        list: vi.fn(),
        listResult,
        findPlansForMonitor: vi.fn(),
        getDetail: vi.fn(),
        getAllForMonitor: vi.fn(),
      },
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

  it('输入类型错误时返回 VALIDATION_FAILED，不调用应用服务', async () => {
    const listResult = vi.fn()
    registerWithListResult(listResult)

    await expect(getHandler(IPC_CHANNELS.promotionPlan.list)({}, { page: 'not-a-number' })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        retryable: false,
      },
    })
    expect(listResult).not.toHaveBeenCalled()
  })

  it('应用服务返回成功结果时，IPC 再次裁剪为稳定白名单', async () => {
    const listResult = vi.fn(async () => ({
      ok: true as const,
      data: {
        advertiserId: '186001',
        plans: [{ id: '9001', name: '计划一', unsafe: 'drop' }],
        unsafe: 'drop',
      },
      unsafe: 'drop',
    }))
    registerWithListResult(listResult)

    await expect(getHandler(IPC_CHANNELS.promotionPlan.list)({}, { advertiserId: '186001' })).resolves.toEqual({
      ok: true,
      data: {
        advertiserId: '186001',
        plans: [{ id: '9001', name: '计划一' }],
      },
    })
  })

  it('应用服务返回非法 Result 时转换为安全校验错误，不透传 Zod 异常', async () => {
    const listResult = vi.fn(async () => ({
      ok: true as const,
      data: { advertiserId: '186001', plans: [{ name: '缺少计划 ID' }] },
    }))
    registerWithListResult(listResult)

    await expect(getHandler(IPC_CHANNELS.promotionPlan.list)({}, {})).resolves.toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: '请求参数格式无效，请刷新页面后重试。',
        retryable: false,
      },
    })
  })
})
