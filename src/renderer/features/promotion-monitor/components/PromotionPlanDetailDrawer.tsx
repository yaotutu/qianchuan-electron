import { Avatar, Descriptions, Divider, Drawer, Space, Tag, Typography } from '@arco-design/web-react'
import type { AdvertiserAccount, PromotionPlan } from '../../../shared/model/qianchuan'
import { formatDateTime, formatMetric, formatMoney } from '../../../shared/utils/format'
import { PROMOTION_STATUS_LABELS, getAccountName } from '../model'

const { Text, Title } = Typography

type PromotionPlanDetailDrawerProps = {
  plan: PromotionPlan | null
  accounts: AdvertiserAccount[]
  visible: boolean
  onClose: () => void
}

const getStatusColor = (status?: string) => {
  if (status === 'DELIVERY_OK') return 'green'
  if (['AUDIT', 'REAUDIT'].includes(status || '')) return 'orange'
  return 'gray'
}

const getStringValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '—'
  return String(value)
}

const getMetricValue = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? value : undefined)

/**
 * 投放计划详情目前是只读抽屉，只展示已经从列表接口拿到的数据。
 * 这样先把用户常用的核对路径跑通，后续接入详情接口时只需替换数据来源，
 * 不会把编辑表单和真实写操作提前混进当前阶段。
 */
export const PromotionPlanDetailDrawer = ({ plan, accounts, visible, onClose }: PromotionPlanDetailDrawerProps) => {
  if (!plan) return null

  const product = plan.products?.[0]
  const accountId = plan.advertiserId
  const planRecord = plan as Record<string, unknown>

  return (
    <Drawer title="投放计划详情" visible={visible} width={520} onCancel={onClose} footer={null}>
      <div className="plan-detail-heading">
        <div className="product-image plan-detail-image">
          {product?.image ? <img src={product.image} alt={product.name || '商品预览图'} /> : '图'}
        </div>
        <div>
          <Title heading={5}>{plan.name || '未命名计划'}</Title>
          <Text type="secondary">全域推广 · 计划 ID {plan.id}</Text>
        </div>
      </div>

      <Space className="plan-detail-status" size="medium">
        <Tag color={getStatusColor(plan.status)}>
          {PROMOTION_STATUS_LABELS[plan.status || ''] || plan.status || '未知状态'}
        </Tag>
        <Text type="secondary">所属千川：{getAccountName(accounts, accountId)}</Text>
      </Space>

      <Divider />
      <Descriptions
        column={1}
        colon="："
        data={[
          { label: '计划 ID', value: plan.id },
          { label: '广告主 ID', value: getStringValue(accountId) },
          { label: '创建时间', value: formatDateTime(plan.createTime) },
          { label: '商品名称', value: getStringValue(product?.name) },
          { label: '消耗', value: formatMoney(plan.metrics?.costYuan) },
          { label: '支付 ROI', value: formatMetric(plan.metrics?.payRoi) },
          { label: '预算', value: formatMoney(getMetricValue(planRecord.budget ?? planRecord.budgetYuan)) },
        ]}
      />

      <Divider />
      <Title heading={6}>当前读取范围</Title>
      <div className="plan-detail-note">
        <Avatar size={28}>读</Avatar>
        <Text type="secondary">
          本详情来自投放计划列表接口，仅用于核对计划和商品信息。编辑、启停、复制、删除等写操作暂未开放。
        </Text>
      </div>
    </Drawer>
  )
}
