import { Form, Input, InputNumber, Modal, Select } from '@arco-design/web-react'
import { useEffect, useState } from 'react'
import type { MonitorRule, MonitorTask, MonitorTaskUpdateInput } from '../../../shared/model/qianchuan'

const METRIC_OPTIONS = [
  { value: 'ROI', label: '支付 ROI' },
  { value: 'COST', label: '消耗（元）' },
  { value: 'BUDGET', label: '预算（元）' },
]
const OPERATOR_OPTIONS = [
  { value: 'GT', label: '大于 >' },
  { value: 'GTE', label: '大于等于 ≥' },
  { value: 'LT', label: '小于 <' },
  { value: 'LTE', label: '小于等于 ≤' },
]

export type MonitorTaskEditorValues = {
  groupName: string
  rule: MonitorRule
  intervalMinutes: number
}

type MonitorTaskEditorModalProps = {
  task: MonitorTask | null
  visible: boolean
  submitting: boolean
  onCancel: () => void
  onSubmit: (input: MonitorTaskUpdateInput) => void
}

/** 编辑窗口只暴露产品自身规则，不允许修改或操作真实千川投放状态。 */
export const MonitorTaskEditorModal = ({
  task,
  visible,
  submitting,
  onCancel,
  onSubmit,
}: MonitorTaskEditorModalProps) => {
  const [values, setValues] = useState<MonitorTaskEditorValues>({
    groupName: '',
    rule: { metric: 'ROI', operator: 'LT', threshold: 1 },
    intervalMinutes: 5,
  })

  useEffect(() => {
    if (!task) return
    setValues({ groupName: task.groupName, rule: task.rule, intervalMinutes: task.intervalMinutes })
  }, [task])

  return (
    <Modal
      title={`编辑监控任务${task ? ` · ${task.promotionPlanName}` : ''}`}
      visible={visible}
      confirmLoading={submitting}
      okText="保存规则"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => onSubmit(values)}
    >
      <Form layout="vertical">
        <Form.Item label="分组名">
          <Input
            value={values.groupName}
            maxLength={40}
            showWordLimit
            placeholder="例如：重点商品"
            onChange={(groupName) => setValues((current) => ({ ...current, groupName }))}
          />
        </Form.Item>
        <div className="rule-form-grid">
          <Form.Item label="监控指标">
            <Select
              value={values.rule.metric}
              options={METRIC_OPTIONS}
              onChange={(metric) => setValues((current) => ({ ...current, rule: { ...current.rule, metric } }))}
            />
          </Form.Item>
          <Form.Item label="比较条件">
            <Select
              value={values.rule.operator}
              options={OPERATOR_OPTIONS}
              onChange={(operator) => setValues((current) => ({ ...current, rule: { ...current.rule, operator } }))}
            />
          </Form.Item>
          <Form.Item label="触发阈值">
            <InputNumber
              min={0}
              precision={2}
              value={values.rule.threshold}
              onChange={(threshold) =>
                setValues((current) => ({
                  ...current,
                  rule: { ...current.rule, threshold: Number(threshold ?? 0) },
                }))
              }
            />
          </Form.Item>
          <Form.Item label="检查间隔">
            <Select
              value={String(values.intervalMinutes)}
              options={[1, 5, 10, 30, 60].map((value) => ({ value: String(value), label: `${value} 分钟` }))}
              onChange={(interval) => setValues((current) => ({ ...current, intervalMinutes: Number(interval) }))}
            />
          </Form.Item>
        </div>
        <div className="safe-action-note">执行动作：通知 / 记录。当前版本不会自动暂停或修改千川真实计划。</div>
      </Form>
    </Modal>
  )
}
