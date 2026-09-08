import { useState } from 'react'
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from '@arco-design/web-react'
import type { AdvertiserAccount, PromotionPlan } from '../../../shared/contracts'
import { PromotionPlanDetailDrawer } from '../promotion-monitor/components/PromotionPlanDetailDrawer'
import { useWorkspacePlans } from '../workspace-plans/useWorkspacePlans'
import { QueryBoundary, WorkspacePageHeader } from '../workspace-plans/components'
import { PROMOTION_STATUS_LABELS } from '../promotion-monitor/model'

const { Text } = Typography
const money = (value?: number | string) =>
  value === undefined ? '—' : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元`

export const PromotionManagementPage = ({
  currentAccountId,
  accounts,
}: {
  currentAccountId: string
  accounts: AdvertiserAccount[]
}) => {
  const query = useWorkspacePlans(currentAccountId)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('ALL')
  const [detailPlan, setDetailPlan] = useState<PromotionPlan | null>(null)
  const plans = (query.data?.ok === true ? query.data.data.plans : []).filter((plan) => {
    const text =
      `${plan.name || ''} ${plan.id} ${(plan.products || []).map((item) => item.name).join(' ')}`.toLocaleLowerCase(
        'zh-CN',
      )
    return (
      (status === 'ALL' || plan.status === status) &&
      (!keyword.trim() || text.includes(keyword.trim().toLocaleLowerCase('zh-CN')))
    )
  })
  const columns = [
    {
      title: '计划',
      render: (_: unknown, plan: PromotionPlan) => (
        <div>
          <strong>{plan.name || '未命名计划'}</strong>
          <br />
          <Text type="secondary">ID {plan.id}</Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string) => (
        <Tag color={value === 'DELIVERY_OK' ? 'green' : 'gray'}>
          {PROMOTION_STATUS_LABELS[value] || value || '未知'}
        </Tag>
      ),
    },
    { title: '预算', render: (_: unknown, plan: PromotionPlan) => money(plan.metrics?.costYuan) },
    { title: '支付 ROI', render: (_: unknown, plan: PromotionPlan) => plan.metrics?.payRoi ?? '—' },
    {
      title: '操作',
      render: (_: unknown, plan: PromotionPlan) => (
        <Button type="text" onClick={() => setDetailPlan(plan)}>
          查看详情 / 修改
        </Button>
      ),
    },
  ]
  return (
    <div className="workspace-page">
      <WorkspacePageHeader
        title="推广管理"
        description="管理当前账号的商品投放计划；本页不提供创建、删除、启停等未确认写操作。"
      />
      <Card bordered={false}>
        <Alert
          type="info"
          content="计划列表和详情均来自巨量官方 OpenAPI。预算与支付 ROI 修改会在详情抽屉中二次确认，名称与投放时间暂不开放。"
        />
        <Space className="workspace-toolbar">
          <Input.Search value={keyword} onChange={setKeyword} placeholder="搜索计划、商品或 ID" allowClear />
          <Select value={status} onChange={setStatus} style={{ width: 180 }}>
            {Object.entries(PROMOTION_STATUS_LABELS).map(([value, label]) => (
              <Select.Option key={value} value={value}>
                {label}
              </Select.Option>
            ))}
          </Select>
        </Space>
        <QueryBoundary
          pending={query.isPending}
          error={query.isError}
          ok={query.data?.ok}
          message={query.data?.ok === false ? query.data.error.message : undefined}
          empty={!plans.length}
          onRetry={() => void query.refetch()}
        >
          <Table rowKey="id" columns={columns} data={plans} pagination={false} />
        </QueryBoundary>
      </Card>
      <PromotionPlanDetailDrawer
        advertiserId={currentAccountId}
        adId={detailPlan?.id}
        visible={Boolean(detailPlan)}
        onClose={() => setDetailPlan(null)}
      />
    </div>
  )
}
