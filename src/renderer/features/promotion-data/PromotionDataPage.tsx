import { Card, Table, Tag } from '@arco-design/web-react'
import type { PromotionPlan } from '../../../shared/contracts'
import { QueryBoundary, SummaryCards, WorkspacePageHeader } from '../workspace-plans/components'
import { summarizePromotionPlans } from '../workspace-plans/model'
import { useWorkspacePlans } from '../workspace-plans/useWorkspacePlans'

const yuan = (value: number) => `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元`
export const PromotionDataPage = ({ currentAccountId }: { currentAccountId: string }) => {
  const query = useWorkspacePlans(currentAccountId)
  const plans = query.data?.ok === true ? query.data.data.plans : []
  const summary = summarizePromotionPlans(plans)
  const columns = [
    { title: '计划', render: (_: unknown, plan: PromotionPlan) => plan.name || `计划 ${plan.id}` },
    {
      title: '状态',
      render: (_: unknown, plan: PromotionPlan) => (
        <Tag color={plan.status === 'DELIVERY_OK' ? 'green' : 'gray'}>{plan.status || '未知'}</Tag>
      ),
    },
    { title: '消耗', render: (_: unknown, plan: PromotionPlan) => yuan(Number(plan.metrics?.costYuan || 0)) },
    { title: '支付 ROI', render: (_: unknown, plan: PromotionPlan) => plan.metrics?.payRoi ?? '—' },
    { title: '支付 GMV', render: (_: unknown, plan: PromotionPlan) => yuan(Number(plan.metrics?.payGmvYuan || 0)) },
  ]
  return (
    <div className="workspace-page">
      <WorkspacePageHeader title="推广数据" description="当前账号当天查询口径的计划指标汇总。" />
      <SummaryCards
        items={[
          { title: '计划数', value: summary.planCount, suffix: '个' },
          { title: '总消耗', value: yuan(summary.totalCostYuan) },
          { title: '综合支付 ROI', value: summary.weightedPayRoi.toFixed(2) },
          { title: '有消耗计划', value: summary.spendingCount, suffix: '个' },
        ]}
      />
      <Card bordered={false}>
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
    </div>
  )
}
