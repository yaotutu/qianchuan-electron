import { describe, expect, it } from 'vitest'
import type { PromotionPlanDetailSnapshot, PromotionPlanEditDraft } from '../../../../shared/contracts'
import {
  buildPromotionPlanChangePreview,
  createPromotionPlanEditInitialValues,
} from '../../../../shared/domain/promotion-plan-change-preview'
import { buildPromotionPlanWritePreflight } from '../../../../shared/domain/promotion-plan-write-preflight'

const createSnapshot = (overrides: Partial<PromotionPlanDetailSnapshot> = {}): PromotionPlanDetailSnapshot => ({
  snapshotId: 'snapshot-1',
  fetchedAt: '2026-09-06T02:33:00.000Z',
  source: 'OCEANENGINE_OPEN_API',
  version: 1,
  contentHash: 'a'.repeat(64),
  identity: {
    advertiserId: '1001',
    adId: '9001',
    name: '原计划',
    status: 'DELIVERY_OK',
  },
  delivery: {
    budgetYuan: 100,
    roiGoal: 2,
    startTime: '2026-09-06 10:00:00',
    endTime: '2026-09-30 23:59:59',
  },
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
  advanced: {
    overallRoiCostItems: [],
  },
  capabilities: {
    canEnable: false,
    canDisable: false,
    canDelete: false,
    canUpdateBudget: true,
    canUpdateRoi: false,
    canUpdateName: true,
    canUpdateSchedule: true,
    canUpdateFullConfig: false,
    reasons: [],
  },
  ...overrides,
})

const createDraft = (
  snapshot: PromotionPlanDetailSnapshot,
  changes: PromotionPlanEditDraft['changes'],
): PromotionPlanEditDraft => ({
  advertiserId: snapshot.identity.advertiserId,
  adId: snapshot.identity.adId,
  baseSnapshotId: snapshot.snapshotId,
  baseContentHash: snapshot.contentHash,
  changes,
})

describe('推广计划修改草稿差异预览', () => {
  it('打开编辑时复制快照字段，未修改时没有差异', () => {
    const snapshot = createSnapshot()
    const result = buildPromotionPlanChangePreview(
      snapshot,
      createDraft(snapshot, createPromotionPlanEditInitialValues(snapshot)),
    )

    expect(result).toEqual({ valid: true, hasChanges: false, changes: [], blockingReasons: [], warnings: [] })
  })

  it('名称首尾空格不会造成伪差异，预算修改会生成稳定字段差异', () => {
    const snapshot = createSnapshot()
    const result = buildPromotionPlanChangePreview(
      snapshot,
      createDraft(snapshot, { name: '  原计划  ', budgetYuan: 120 }),
    )

    expect(result.valid).toBe(true)
    expect(result.changes).toEqual([
      { field: 'budgetYuan', label: '预算（元）', before: 100, after: 120, allowed: true },
    ])
    expect(result.warnings).toHaveLength(2)
  })

  it('能力不允许时阻塞该字段修改，不能被其他字段的能力掩盖', () => {
    const snapshot = createSnapshot()
    const result = buildPromotionPlanChangePreview(snapshot, createDraft(snapshot, { roiGoal: 3 }))

    expect(result.valid).toBe(false)
    expect(result.changes[0]).toMatchObject({ field: 'roiGoal', allowed: false })
    expect(result.blockingReasons).toContain('支付 ROI：当前计划不具备 ROI 修改能力。')
  })

  it('时间只修改一侧或结束时间早于开始时间时阻塞预览', () => {
    const snapshot = createSnapshot()
    const onlyStart = buildPromotionPlanChangePreview(
      snapshot,
      createDraft(snapshot, { startTime: '2026-09-07 10:00:00' }),
    )
    const reversed = buildPromotionPlanChangePreview(
      snapshot,
      createDraft(snapshot, { startTime: '2026-10-01 10:00:00', endTime: '2026-09-30 23:59:59' }),
    )

    expect(onlyStart.valid).toBe(false)
    expect(onlyStart.blockingReasons).toContain('投放时间：开始时间和结束时间必须同时填写。')
    expect(reversed.valid).toBe(false)
    expect(reversed.blockingReasons).toContain('投放时间：结束时间不能早于开始时间。')
  })

  it('删除计划和过期快照基线都不能生成可提交预览', () => {
    const deleted = createSnapshot({ identity: { ...createSnapshot().identity, status: 'DELETED' } })
    const deletedResult = buildPromotionPlanChangePreview(deleted, createDraft(deleted, { name: '新名称' }))
    const stale = createSnapshot()
    const staleResult = buildPromotionPlanChangePreview(stale, {
      ...createDraft(stale, { budgetYuan: 120 }),
      baseContentHash: 'b'.repeat(64),
    })

    expect(deletedResult.valid).toBe(false)
    expect(deletedResult.blockingReasons).toContain('计划名称：已删除计划不能修改。')
    expect(staleResult.valid).toBe(false)
    expect(staleResult.blockingReasons).toContain('草稿基线与当前快照不一致，请基于最新详情重新生成修改预览。')
  })
})

describe('推广计划写入提交准备层', () => {
  it('预算修改只生成官方预算增量接口命令，不生成其他配置字段', () => {
    const snapshot = createSnapshot()
    const result = buildPromotionPlanWritePreflight(snapshot, createDraft(snapshot, { budgetYuan: 120 }))

    expect(result.valid).toBe(true)
    expect(result.hasSupportedChanges).toBe(true)
    expect(result.requiresUserConfirmation).toBe(true)
    expect(result.commands).toEqual([
      {
        operation: 'UPDATE_BUDGET',
        endpoint: '/open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/',
        changedFields: ['budgetYuan'],
        payload: {
          advertiser_id: 1001,
          update_budget_infos: [{ ad_id: 9001, budget: 120 }],
        },
      },
    ])
  })

  it('控成本 ROI 修改带入平台明确返回的深层转化类型', () => {
    const snapshot = createSnapshot({
      delivery: { ...createSnapshot().delivery, deepExternalAction: 'AD_CONVERT_TYPE_LIVE_PAY_ROI' },
      capabilities: { ...createSnapshot().capabilities, canUpdateRoi: true },
    })
    const result = buildPromotionPlanWritePreflight(snapshot, createDraft(snapshot, { roiGoal: 3.5 }))

    expect(result.valid).toBe(true)
    expect(result.commands[0]).toMatchObject({
      operation: 'UPDATE_ROI',
      endpoint: '/open_api/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/',
      payload: {
        advertiser_id: 1001,
        update_roi2_infos: [{ ad_id: 9001, roi2_goal: 3.5, deep_external_action: 'AD_CONVERT_TYPE_LIVE_PAY_ROI' }],
      },
    })
  })

  it('名称和时间即使能通过本地差异校验，也必须阻塞在未核实的官方接口边界', () => {
    const snapshot = createSnapshot()
    const result = buildPromotionPlanWritePreflight(
      snapshot,
      createDraft(snapshot, {
        name: '新计划',
        startTime: '2026-09-07 10:00:00',
        endTime: '2026-10-01 23:59:59',
      }),
    )

    expect(result.valid).toBe(false)
    expect(result.commands).toEqual([])
    expect(result.unsupportedFields).toEqual(['计划名称', '开始时间', '结束时间'])
    expect(result.blockingReasons).toEqual([
      '计划名称：官方写接口路径和字段仍待确认，当前不会生成正式写命令。',
      '开始时间：官方写接口路径和字段仍待确认，当前不会生成正式写命令。',
      '结束时间：官方写接口路径和字段仍待确认，当前不会生成正式写命令。',
    ])
  })

  it('建议预算缺少官方估算参数时安全阻塞，不能猜测成本保障字段', () => {
    const snapshot = createSnapshot({
      delivery: { ...createSnapshot().delivery, budgetMode: 'BUDGET_MODE_RECOMMEND' },
    })
    const result = buildPromotionPlanWritePreflight(snapshot, createDraft(snapshot, { budgetYuan: 120 }))

    expect(result.valid).toBe(false)
    expect(result.commands).toEqual([])
    expect(result.blockingReasons).toContain(
      '预算（元）：当前计划使用建议预算模式，提交预算前必须先读取官方建议预算及成本保障参数；当前快照资料不足，已阻止生成命令。',
    )
  })

  it('草稿基线过期时采用 fail-closed，不返回任何可误执行的写命令', () => {
    const snapshot = createSnapshot()
    const result = buildPromotionPlanWritePreflight(snapshot, {
      ...createDraft(snapshot, { budgetYuan: 120 }),
      baseContentHash: 'b'.repeat(64),
    })

    expect(result.valid).toBe(false)
    expect(result.hasSupportedChanges).toBe(true)
    expect(result.commands).toEqual([])
    expect(result.requiresUserConfirmation).toBe(false)
  })

  it('预算和 ROI 超过两位小数时不生成命令', () => {
    const snapshot = createSnapshot({
      capabilities: { ...createSnapshot().capabilities, canUpdateRoi: true },
    })
    const result = buildPromotionPlanWritePreflight(
      snapshot,
      createDraft(snapshot, { budgetYuan: 120.001, roiGoal: 2.345 }),
    )

    expect(result.valid).toBe(false)
    expect(result.commands).toEqual([])
    expect(result.blockingReasons).toContain('预算（元）：预算最多保留两位小数。')
    expect(result.blockingReasons).toContain('支付 ROI：支付 ROI 最多保留两位小数。')
  })

  it('超过 JS 安全整数范围的 ID 不得被转换成可能错误的 number', () => {
    const snapshot = createSnapshot({
      identity: { ...createSnapshot().identity, advertiserId: '9007199254740993' },
    })
    const result = buildPromotionPlanWritePreflight(snapshot, createDraft(snapshot, { budgetYuan: 120 }))

    expect(result.valid).toBe(false)
    expect(result.commands).toEqual([])
    expect(result.blockingReasons).toContain('预算（元）：广告主 ID 超出当前客户端可安全提交的整数范围。')
  })
})
