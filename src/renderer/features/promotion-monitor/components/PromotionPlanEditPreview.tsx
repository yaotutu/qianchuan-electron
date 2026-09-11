import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qianchuanApi } from '../../../shared/api/qianchuan-api'
import { promotionPlanQueryKeys } from '../../../shared/query-keys'
import { showErrorFeedback, showSuccessFeedback } from '../../../shared/ui/feedback'
import type { PromotionPlanDetailSnapshot, PromotionPlanEditChanges } from '../../../../shared/contracts'
import { promotionPlanEditDraftSchema } from '../../../../shared/contracts'
import {
  buildPromotionPlanChangePreview,
  createPromotionPlanEditInitialValues,
} from '../../../../shared/domain/promotion-plan-change-preview'
import { buildPromotionPlanWritePreflight } from '../../../../shared/domain/promotion-plan-write-preflight'

const { Text } = Typography

type PromotionPlanEditPreviewProps = {
  snapshot: PromotionPlanDetailSnapshot
}

const formatPreviewValue = (field: string, value: string | number | undefined) => {
  if (value === undefined || value === '' || value === '未填写') return '未填写'
  if (field === 'budgetYuan') return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元`
  return String(value)
}

/**
 * 该组件负责受控字段编辑、差异预览和真实提交确认。提交仍必须经过：
 * 1）Renderer Schema 校验；2）用户勾选二次确认；3）主进程重读详情并比对 Hash；
 * 4）主进程按最新快照重新生成白名单命令；5）写后回读确认。
 */
export const PromotionPlanEditPreview = ({ snapshot }: PromotionPlanEditPreviewProps) => {
  const [expanded, setExpanded] = useState(false)
  const [changes, setChanges] = useState<PromotionPlanEditChanges>(() => createPromotionPlanEditInitialValues(snapshot))
  const [showPreview, setShowPreview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const queryClient = useQueryClient()
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!draftResult.success || !preflight?.valid) throw new Error('当前修改未通过安全校验。')
      return qianchuanApi.updatePromotionPlan({ draft: draftResult.data, confirmed: true })
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        showErrorFeedback(result.error.message)
        return
      }

      // 预算与 ROI 是两个独立的官方增量请求；部分成功时不能把它展示成普通成功，
      // 需要主动刷新详情并提醒用户核对平台最终值，避免基于旧快照继续编辑。
      if (result.data.status === 'partial_updated') {
        await queryClient.invalidateQueries({
          queryKey: promotionPlanQueryKeys.detail({
            advertiserId: snapshot.identity.advertiserId,
            adId: snapshot.identity.adId,
          }),
        })
        setConfirmed(false)
        showErrorFeedback(result.data.message || '部分修改可能已经生效，请刷新详情核对预算和支付 ROI。')
        return
      }

      await queryClient.invalidateQueries({
        queryKey: promotionPlanQueryKeys.detail({
          advertiserId: snapshot.identity.advertiserId,
          adId: snapshot.identity.adId,
        }),
      })
      setConfirmed(false)
      setShowPreview(false)
      showSuccessFeedback(result.data.message || '计划修改已完成。')
    },
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '提交计划修改失败。'),
  })

  useEffect(() => {
    setExpanded(false)
    setShowPreview(false)
    setConfirmed(false)
    setChanges(createPromotionPlanEditInitialValues(snapshot))
  }, [snapshot])

  const draftResult = useMemo(
    () =>
      promotionPlanEditDraftSchema.safeParse({
        advertiserId: snapshot.identity.advertiserId,
        adId: snapshot.identity.adId,
        baseSnapshotId: snapshot.snapshotId,
        baseContentHash: snapshot.contentHash,
        changes,
      }),
    [changes, snapshot],
  )

  const preview = useMemo(
    () => (draftResult.success ? buildPromotionPlanChangePreview(snapshot, draftResult.data) : undefined),
    [draftResult, snapshot],
  )

  const preflight = useMemo(
    () => (draftResult.success ? buildPromotionPlanWritePreflight(snapshot, draftResult.data) : undefined),
    [draftResult, snapshot],
  )

  const updateChanges = (updater: (current: PromotionPlanEditChanges) => PromotionPlanEditChanges) => {
    setChanges(updater)
    setShowPreview(false)
    setConfirmed(false)
  }

  const resetDraft = () => {
    setChanges(createPromotionPlanEditInitialValues(snapshot))
    setShowPreview(false)
    setConfirmed(false)
  }

  if (!expanded) {
    return (
      <div className="plan-edit-entry">
        <div>
          <Text bold>修改前预览</Text>
          <br />
          <Text type="secondary">在本地生成名称、预算、ROI 和投放时间的字段级差异。</Text>
        </div>
        <Button type="primary" onClick={() => setExpanded(true)}>
          生成修改预览
        </Button>
      </div>
    )
  }

  return (
    <div className="plan-edit-preview">
      <Alert type="warning" content="预算与支付 ROI 会在确认后提交到巨量官方接口；名称与投放时间仍只做本地预览。" />
      <Form layout="vertical" className="plan-edit-form">
        <Form.Item label="计划名称">
          <Input
            value={changes.name}
            maxLength={200}
            showWordLimit
            placeholder="请输入计划名称"
            onChange={(name) => {
              updateChanges((current) => ({ ...current, name }))
            }}
          />
        </Form.Item>
        <div className="plan-edit-number-grid">
          <Form.Item label="预算（元）">
            <InputNumber
              value={changes.budgetYuan}
              min={0}
              precision={2}
              placeholder="请输入预算"
              onChange={(budgetYuan) => {
                updateChanges((current) => ({ ...current, budgetYuan: budgetYuan ?? undefined }))
              }}
            />
          </Form.Item>
          <Form.Item label="支付 ROI">
            <InputNumber
              value={changes.roiGoal}
              min={0}
              precision={2}
              placeholder="请输入 ROI"
              onChange={(roiGoal) => {
                updateChanges((current) => ({ ...current, roiGoal: roiGoal ?? undefined }))
              }}
            />
          </Form.Item>
        </div>
        <div className="plan-edit-time-grid">
          <Form.Item label="开始时间">
            <Input
              value={changes.startTime}
              placeholder="例如：2026-09-06 10:00:00"
              onChange={(startTime) => {
                updateChanges((current) => ({ ...current, startTime }))
              }}
            />
          </Form.Item>
          <Form.Item label="结束时间">
            <Input
              value={changes.endTime}
              placeholder="例如：2026-09-30 23:59:59"
              onChange={(endTime) => {
                updateChanges((current) => ({ ...current, endTime }))
              }}
            />
          </Form.Item>
        </div>
      </Form>

      <Space>
        <Button type="primary" onClick={() => setShowPreview(true)}>
          对比修改前后
        </Button>
        <Button onClick={resetDraft}>恢复快照值</Button>
        <Button
          type="text"
          onClick={() => {
            resetDraft()
            setExpanded(false)
          }}
        >
          收起
        </Button>
      </Space>

      {showPreview && !draftResult.success && (
        <Alert
          className="plan-edit-result"
          type="error"
          content={draftResult.error.issues.map((issue) => issue.message).join('；') || '修改草稿格式无效。'}
        />
      )}
      {showPreview && preview && (
        <div className="plan-edit-result">
          {!preview.hasChanges && <Alert type="info" content="当前草稿与平台快照一致，没有需要预览的修改。" />}
          {preview.hasChanges && (
            <>
              <Descriptions
                column={1}
                size="small"
                border
                data={preview.changes.map((change) => ({
                  label: change.label,
                  value: (
                    <div className="plan-edit-change-row">
                      <span>{formatPreviewValue(change.field, change.before)}</span>
                      <span className="plan-edit-arrow">→</span>
                      <strong>{formatPreviewValue(change.field, change.after)}</strong>
                      <Tag color={change.allowed ? 'green' : 'red'}>{change.allowed ? '能力校验通过' : '不可修改'}</Tag>
                      {change.reason && <Text type="secondary">{change.reason}</Text>}
                    </div>
                  ),
                }))}
              />
              {preflight && preflight.commands.length > 0 && (
                <div className="plan-write-command-list">
                  <Text bold>官方写接口提交准备</Text>
                  {preflight.commands.map((command) => (
                    <div key={command.operation} className="plan-write-command">
                      <div>
                        <Tag color="arcoblue">
                          {command.operation === 'UPDATE_BUDGET' ? '更新预算' : '更新支付 ROI'}
                        </Tag>
                        <Text code>{command.endpoint}</Text>
                      </div>
                      <Text type="secondary">
                        已按字段 Diff 生成最小增量载荷；广告主 {command.payload.advertiser_id}，计划{' '}
                        {snapshot.identity.adId}。
                      </Text>
                    </div>
                  ))}
                </div>
              )}
              {preflight && preflight.blockingReasons.length > 0 && (
                <Alert type="error" content={preflight.blockingReasons.join('；')} />
              )}
              {preflight?.warnings.map((warning) => (
                <Alert key={warning} type="warning" content={warning} />
              ))}
              {preflight?.valid && (
                <div className="plan-write-confirmation">
                  <Checkbox checked={confirmed} onChange={setConfirmed}>
                    我已核对广告主、计划和目标值，并理解真实提交前还会重新读取最新快照。
                  </Checkbox>
                  <Text type="secondary">
                    提交后会调用巨量官方预算 / ROI 接口；主进程会重读快照并在冲突时阻止提交。
                  </Text>
                </div>
              )}
            </>
          )}
          <div className="plan-edit-submit-placeholder">
            <Button
              type="primary"
              loading={updateMutation.isPending}
              disabled={!confirmed || !preflight?.valid}
              onClick={() => {
                Modal.confirm({
                  title: '确认提交千川计划修改？',
                  content:
                    '提交后将直接调用巨量官方接口修改真实计划。系统会先校验最新快照，若配置发生变化将自动阻止提交。',
                  okText: '确认提交',
                  cancelText: '取消',
                  onOk: () => updateMutation.mutate(),
                })
              }}
            >
              {updateMutation.isPending ? '正在提交…' : '提交真实修改'}
            </Button>
            <Text type="secondary">仅支持预算和支付 ROI；名称、投放时间仍保持阻断。</Text>
          </div>
        </div>
      )}
    </div>
  )
}
