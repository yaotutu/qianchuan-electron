import {
  promotionPlanWritePreflightSchema,
  type PromotionPlanDetailSnapshot,
  type PromotionPlanEditDraft,
  type PromotionPlanFieldChange,
  type PromotionPlanWriteCommand,
  type PromotionPlanWritePreflight,
} from '../contracts'
import { buildPromotionPlanChangePreview } from './promotion-plan-change-preview'

const BUDGET_ENDPOINT = '/open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/' as const
const ROI_ENDPOINT = '/open_api/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/' as const

const SUPPORTED_DEEP_EXTERNAL_ACTIONS = new Set(['AD_CONVERT_TYPE_LIVE_PAY_ROI', 'AD_CONVERT_TYPE_LIVE_PURE_PAY_ROI'])

const getFieldChange = (changes: ReadonlyArray<PromotionPlanFieldChange>, field: PromotionPlanFieldChange['field']) =>
  changes.find((change) => change.field === field)

const toSafePositiveInteger = (value: string, label: string): { value?: number; reason?: string } => {
  const parsed = Number(value)
  // 广告主 ID 和计划 ID 在官方文档中是 number，但前端不能把超出 JS 安全整数范围的
  // 30 位字符串静默四舍五入后提交，否则可能把请求发送到另一个广告主或计划。
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { reason: `${label} 超出当前客户端可安全提交的整数范围。` }
  }
  return { value: parsed }
}

const hasAtMostTwoDecimalPlaces = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8

const isRecommendedBudgetMode = (budgetMode: string | undefined) => {
  const normalized = (budgetMode ?? '').trim().toUpperCase()
  // 官方文档对建议预算的枚举和值约束仍需以平台实时返回为准；这里仅对已知语义做保守拦截，
  // 不把未知值猜测成普通预算模式。
  return /RECOMMEND|SUGGEST|建议/.test(normalized)
}

const addUnique = (items: string[], value: string) => {
  if (!items.includes(value)) items.push(value)
}

const buildBudgetCommand = (
  snapshot: PromotionPlanDetailSnapshot,
  change: PromotionPlanFieldChange,
): { command?: PromotionPlanWriteCommand; reason?: string; warning?: string } => {
  const advertiserId = toSafePositiveInteger(snapshot.identity.advertiserId, '广告主 ID')
  const adId = toSafePositiveInteger(snapshot.identity.adId, '计划 ID')
  if (!advertiserId.value || !adId.value) return { reason: advertiserId.reason || adId.reason }

  if (isRecommendedBudgetMode(snapshot.delivery.budgetMode)) {
    return {
      reason:
        '当前计划使用建议预算模式，提交预算前必须先读取官方建议预算及成本保障参数；当前快照资料不足，已阻止生成命令。',
    }
  }

  if (typeof change.after !== 'number' || !Number.isFinite(change.after) || change.after <= 0) {
    return { reason: '预算目标不是可提交的正数。' }
  }
  if (!hasAtMostTwoDecimalPlaces(change.after)) return { reason: '预算最多保留两位小数。' }

  return {
    command: {
      operation: 'UPDATE_BUDGET',
      endpoint: BUDGET_ENDPOINT,
      changedFields: ['budgetYuan'],
      payload: {
        advertiser_id: advertiserId.value,
        update_budget_infos: [{ ad_id: adId.value, budget: change.after }],
      },
    },
    warning: '预算命令仍需由 Electron 主进程重新读取计划，并确认权限、归属、状态及建议预算约束。',
  }
}

const buildRoiCommand = (
  snapshot: PromotionPlanDetailSnapshot,
  change: PromotionPlanFieldChange,
): { command?: PromotionPlanWriteCommand; reason?: string; warning?: string } => {
  const advertiserId = toSafePositiveInteger(snapshot.identity.advertiserId, '广告主 ID')
  const adId = toSafePositiveInteger(snapshot.identity.adId, '计划 ID')
  if (!advertiserId.value || !adId.value) return { reason: advertiserId.reason || adId.reason }

  if (typeof change.after !== 'number' || !Number.isFinite(change.after) || change.after <= 0) {
    return { reason: '支付 ROI 目标不是可提交的正数。' }
  }
  if (!hasAtMostTwoDecimalPlaces(change.after)) return { reason: '支付 ROI 最多保留两位小数。' }

  const deepExternalAction = snapshot.delivery.deepExternalAction
  const payloadInfo = {
    ad_id: adId.value,
    roi2_goal: change.after,
    ...(deepExternalAction && SUPPORTED_DEEP_EXTERNAL_ACTIONS.has(deepExternalAction)
      ? {
          deep_external_action: deepExternalAction as
            'AD_CONVERT_TYPE_LIVE_PAY_ROI' | 'AD_CONVERT_TYPE_LIVE_PURE_PAY_ROI',
        }
      : {}),
  }

  return {
    command: {
      operation: 'UPDATE_ROI',
      endpoint: ROI_ENDPOINT,
      changedFields: ['roiGoal'],
      payload: {
        advertiser_id: advertiserId.value,
        update_roi2_infos: [payloadInfo],
      },
    },
    ...(deepExternalAction && !SUPPORTED_DEEP_EXTERNAL_ACTIONS.has(deepExternalAction)
      ? { warning: '快照中的深层转化类型不是当前官方文档确认值，已安全省略该可选字段。' }
      : {}),
  }
}

/**
 * 只生成官方专项写接口的“提交准备命令”，不执行网络请求。
 *
 * 这里故意把预览校验、能力校验、字段白名单和平台资料完整性检查集中在一个纯函数中，
 * 当前真实写入由 Electron 主进程执行，因此主进程必须重新读取快照并重复校验，不能把 Renderer 的结果当作授权凭证。
 */
export const buildPromotionPlanWritePreflight = (
  snapshot: PromotionPlanDetailSnapshot,
  draft: PromotionPlanEditDraft,
): PromotionPlanWritePreflight => {
  const preview = buildPromotionPlanChangePreview(snapshot, draft)
  const blockingReasons = [...preview.blockingReasons]
  const warnings = [...preview.warnings]
  const unsupportedFields: string[] = []
  const candidateCommands: PromotionPlanWriteCommand[] = []

  const unsupportedFieldLabels: Record<'name' | 'startTime' | 'endTime', string> = {
    name: '计划名称',
    startTime: '开始时间',
    endTime: '结束时间',
  }

  ;(['name', 'startTime', 'endTime'] as const).forEach((field) => {
    if (!getFieldChange(preview.changes, field)) return
    const label = unsupportedFieldLabels[field]
    addUnique(unsupportedFields, label)
    addUnique(blockingReasons, `${label}：官方写接口路径和字段仍待确认，当前不会生成正式写命令。`)
  })

  const budgetChange = getFieldChange(preview.changes, 'budgetYuan')
  if (budgetChange?.allowed) {
    const result = buildBudgetCommand(snapshot, budgetChange)
    if (result.command) candidateCommands.push(result.command)
    if (result.reason) addUnique(blockingReasons, `预算（元）：${result.reason}`)
    if (result.warning) addUnique(warnings, result.warning)
  }

  const roiChange = getFieldChange(preview.changes, 'roiGoal')
  if (roiChange?.allowed) {
    const result = buildRoiCommand(snapshot, roiChange)
    if (result.command) candidateCommands.push(result.command)
    if (result.reason) addUnique(blockingReasons, `支付 ROI：${result.reason}`)
    if (result.warning) addUnique(warnings, result.warning)
  }

  const canPrepareCommands = preview.valid && blockingReasons.length === 0
  // 任一校验失败都清空命令，保持 fail-closed。调用方即使错误地忽略 valid，
  // 也拿不到可执行载荷，避免在草稿过期或混有未支持字段时发生部分写入。
  const commands = canPrepareCommands ? candidateCommands : []

  if (commands.length > 0) {
    addUnique(warnings, '当前仅生成官方开放平台增量接口的本地准备结果，不会发送请求或修改真实计划。')
    addUnique(warnings, '真实提交前必须由 Electron 主进程重读最新详情并校验 baseContentHash，防止并发覆盖。')
  }

  const result = {
    valid: canPrepareCommands && commands.length > 0,
    hasSupportedChanges: candidateCommands.length > 0,
    // 即使调用方只把结果用于预览，也保留二次确认标记，避免真实提交时遗漏。
    requiresUserConfirmation: commands.length > 0,
    commands,
    unsupportedFields,
    blockingReasons: [...new Set(blockingReasons)],
    warnings: [...new Set(warnings)],
  }

  return promotionPlanWritePreflightSchema.parse(result)
}
