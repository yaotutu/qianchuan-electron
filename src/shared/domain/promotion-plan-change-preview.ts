import type {
  PromotionPlanChangePreview,
  PromotionPlanDetailSnapshot,
  PromotionPlanEditChanges,
  PromotionPlanEditDraft,
  PromotionPlanEditableField,
  PromotionPlanFieldChange,
} from '../contracts'

const EDITABLE_FIELDS: ReadonlyArray<{
  field: PromotionPlanEditableField
  label: string
}> = [
  { field: 'name', label: '计划名称' },
  { field: 'budgetYuan', label: '预算（元）' },
  { field: 'roiGoal', label: '支付 ROI' },
  { field: 'startTime', label: '开始时间' },
  { field: 'endTime', label: '结束时间' },
]

const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)

const trimText = (value: string | undefined) => (value === undefined ? undefined : value.trim())

const normalizeFieldValue = (field: PromotionPlanEditableField, value: string | number | undefined) => {
  if (field === 'name' || field === 'startTime' || field === 'endTime') return trimText(value as string | undefined)
  return value
}

const formatFieldValue = (field: PromotionPlanEditableField, value: string | number | undefined) => {
  if (value === undefined || value === '') return '未填写'
  if (field === 'budgetYuan') return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元`
  return String(value)
}

const getBeforeValue = (snapshot: PromotionPlanDetailSnapshot, field: PromotionPlanEditableField) => {
  if (field === 'name') return snapshot.identity.name
  if (field === 'budgetYuan') return snapshot.delivery.budgetYuan
  if (field === 'roiGoal') return snapshot.delivery.roiGoal
  if (field === 'startTime') return snapshot.delivery.startTime
  return snapshot.delivery.endTime
}

const getCapability = (snapshot: PromotionPlanDetailSnapshot, field: PromotionPlanEditableField) => {
  if (field === 'name') return snapshot.capabilities.canUpdateName
  if (field === 'budgetYuan') return snapshot.capabilities.canUpdateBudget
  if (field === 'roiGoal') return snapshot.capabilities.canUpdateRoi
  return snapshot.capabilities.canUpdateSchedule
}

const capabilityReason = (field: PromotionPlanEditableField) => {
  if (field === 'name') return '当前计划不具备名称修改能力。'
  if (field === 'budgetYuan') return '当前计划不具备预算修改能力。'
  if (field === 'roiGoal') return '当前计划不具备 ROI 修改能力。'
  return '当前计划不具备投放时间修改能力。'
}

const valuesEqual = (before: string | number | undefined, after: string | number | undefined) => before === after

const isPositiveFiniteNumber = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value > 0

const validateFieldValue = (field: PromotionPlanEditableField, value: string | number | undefined) => {
  if (field === 'name') return value ? undefined : '计划名称不能为空。'
  if (field === 'budgetYuan')
    return isPositiveFiniteNumber(value as number | undefined) ? undefined : '预算必须是大于 0 的有限数字。'
  if (field === 'roiGoal')
    return isPositiveFiniteNumber(value as number | undefined) ? undefined : '支付 ROI 必须是大于 0 的有限数字。'
  return value ? undefined : `${field === 'startTime' ? '开始时间' : '结束时间'}不能为空。`
}

const validateSchedule = (
  snapshot: PromotionPlanDetailSnapshot,
  changes: PromotionPlanEditChanges,
  changedFields: ReadonlyArray<PromotionPlanEditableField>,
) => {
  if (!changedFields.includes('startTime') && !changedFields.includes('endTime')) return undefined
  if (hasOwn(changes, 'startTime') !== hasOwn(changes, 'endTime')) return '开始时间和结束时间必须同时填写。'

  const startTime = trimText(hasOwn(changes, 'startTime') ? changes.startTime : snapshot.delivery.startTime)
  const endTime = trimText(hasOwn(changes, 'endTime') ? changes.endTime : snapshot.delivery.endTime)
  if (!startTime || !endTime) return '开始时间和结束时间必须同时填写。'

  const startTimestamp = Date.parse(startTime.replace(' ', 'T'))
  const endTimestamp = Date.parse(endTime.replace(' ', 'T'))
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return '开始时间和结束时间格式无法识别。'
  if (endTimestamp < startTimestamp) return '结束时间不能早于开始时间。'
  return undefined
}

/**
 * 从平台快照生成编辑表单的初始值。字段保持与快照一致，避免用户打开预览时看到空白表单。
 * 返回新对象而不是复用快照引用，保证后续表单更新不会污染查询缓存中的只读数据。
 */
export const createPromotionPlanEditInitialValues = (
  snapshot: PromotionPlanDetailSnapshot,
): PromotionPlanEditChanges => ({
  name: snapshot.identity.name,
  budgetYuan: snapshot.delivery.budgetYuan,
  roiGoal: snapshot.delivery.roiGoal,
  startTime: snapshot.delivery.startTime,
  endTime: snapshot.delivery.endTime,
})

/**
 * 生成本地字段级差异。该函数只做校验和展示模型计算，永远不会触发网络请求或真实写操作。
 * 能力判断按字段分别处理，不能用 canUpdateFullConfig 作为总开关，以免误把部分能力当成完整写权限。
 */
export const buildPromotionPlanChangePreview = (
  snapshot: PromotionPlanDetailSnapshot,
  draft: PromotionPlanEditDraft,
): PromotionPlanChangePreview => {
  const changes = draft.changes
  const blockingReasons: string[] = []
  const warnings: string[] = []
  const fieldChanges: PromotionPlanFieldChange[] = []

  // 草稿必须绑定当前正在预览的快照；即使 UI 状态串页，也不能把另一计划的草稿误展示为当前计划修改。
  if (draft.advertiserId !== snapshot.identity.advertiserId || draft.adId !== snapshot.identity.adId) {
    blockingReasons.push('草稿所属计划与当前详情不一致，请关闭后重新打开。')
  }
  if (draft.baseSnapshotId !== snapshot.snapshotId || draft.baseContentHash !== snapshot.contentHash) {
    blockingReasons.push('草稿基线与当前快照不一致，请基于最新详情重新生成修改预览。')
  }

  EDITABLE_FIELDS.forEach(({ field, label }) => {
    if (!hasOwn(changes, field)) return

    const before = normalizeFieldValue(field, getBeforeValue(snapshot, field))
    const after = normalizeFieldValue(field, changes[field])
    if (valuesEqual(before, after)) return

    const capabilityAllowed = getCapability(snapshot, field) && snapshot.identity.status !== 'DELETED'
    const reasons: string[] = []
    if (!capabilityAllowed)
      reasons.push(snapshot.identity.status === 'DELETED' ? '已删除计划不能修改。' : capabilityReason(field))

    const validationReason = validateFieldValue(field, after)
    if (validationReason) reasons.push(validationReason)

    const change: PromotionPlanFieldChange = {
      field,
      label,
      before,
      after: after === undefined ? '未填写' : after,
      allowed: capabilityAllowed && !validationReason,
      ...(reasons.length > 0 ? { reason: reasons.join(' ') } : {}),
    }
    fieldChanges.push(change)
    blockingReasons.push(...reasons.map((reason) => `${label}：${reason}`))
  })

  const changedFields = fieldChanges.map(({ field }) => field)
  const scheduleReason = validateSchedule(snapshot, changes, changedFields)
  if (scheduleReason) blockingReasons.push(`投放时间：${scheduleReason}`)

  const hasChanges = fieldChanges.length > 0
  if (hasChanges) {
    warnings.push('该结果仅为本地差异预览，不代表平台最终接受。')
    warnings.push('真实提交前，必须重新读取详情并校验 baseContentHash，避免覆盖他人或平台的新修改。')
  }

  return {
    valid: blockingReasons.length === 0,
    hasChanges,
    changes: fieldChanges,
    blockingReasons: [...new Set(blockingReasons)],
    warnings,
  }
}
