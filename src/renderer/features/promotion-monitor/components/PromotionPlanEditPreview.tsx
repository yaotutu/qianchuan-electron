import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { useEffect, useMemo, useState } from 'react'
import type { PromotionPlanDetailSnapshot, PromotionPlanEditChanges } from '../../../../shared/contracts'
import { promotionPlanEditDraftSchema } from '../../../../shared/contracts'
import { buildPromotionPlanChangePreview, createPromotionPlanEditInitialValues } from '../plan-change-preview'
import { buildPromotionPlanWritePreflight } from '../plan-write-preflight'

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
 * 该组件是“写操作接入前”的本地沙盘：用户可以编辑受控字段并查看差异与能力判断，
 * 但组件没有提交回调、没有 IPC，也不会持久化草稿，从结构上杜绝误触真实千川写接口。
 */
export const PromotionPlanEditPreview = ({ snapshot }: PromotionPlanEditPreviewProps) => {
  const [expanded, setExpanded] = useState(false)
  const [changes, setChanges] = useState<PromotionPlanEditChanges>(() => createPromotionPlanEditInitialValues(snapshot))
  const [showPreview, setShowPreview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

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
      <Alert type="warning" content="本页面只生成本地差异预览，不会向千川提交、保存或执行任何修改。" />
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
                  <Text type="secondary">这是二次确认界面预演；当前版本不会发送任何写请求。</Text>
                </div>
              )}
            </>
          )}
          <div className="plan-edit-submit-placeholder">
            <Button disabled type="primary">
              {confirmed ? '提交修改（接口未接通）' : '提交修改（尚未开放）'}
            </Button>
            <Text type="secondary">真实执行入口尚未接入，按钮始终禁用。</Text>
          </div>
        </div>
      )}
    </div>
  )
}
