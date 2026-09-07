import { useMemo } from 'react'
import { Alert, Card, Table, Tag } from '@arco-design/web-react'
import type { AdvertiserAccount } from '../../../shared/contracts'
import { useWorkspacePlans } from '../workspace-plans/useWorkspacePlans'
import { QueryBoundary, SummaryCards, WorkspacePageHeader } from '../workspace-plans/components'
import { summarizePromotionPlans } from '../workspace-plans/model'
import { useMonitorTasks } from '../promotion-monitor/hooks/useMonitorTasks'

export const MultiplierManagementPage = ({ currentAccountId }: { currentAccountId: string }) => {
  const query = useWorkspacePlans(currentAccountId, 'OVERALL_PROJECT')
  const plans = query.data?.plans || []
  const candidates = plans.filter((plan) => plan.scene === 'OVERALL_PROJECT')
  return (
    <div className="workspace-page">
      <WorkspacePageHeader
        title="乘方管理"
        description="基于已接入的全域计划数据识别乘方候选，不调用未经确认的乘方写接口。"
      />
      <Card bordered={false}>
        <Alert type="info" content="当前仅展示平台返回的全域计划视图；创建、删除、启停等乘方写操作暂不执行。" />
        <QueryBoundary
          pending={query.isPending}
          error={query.isError}
          ok={query.data?.ok}
          message={query.data?.message}
          empty={!candidates.length}
          onRetry={() => void query.refetch()}
        >
          <Table
            rowKey="id"
            columns={[
              { title: '计划', dataIndex: 'name' },
              { title: '场景', dataIndex: 'scene' },
              { title: '状态', dataIndex: 'status' },
              {
                title: '多号乘方候选',
                render: (_: unknown, plan) => (
                  <Tag color="arcoblue">{plan.scene === 'OVERALL_PROJECT' ? '全域计划' : '待确认'}</Tag>
                ),
              },
            ]}
            data={candidates}
            pagination={false}
          />
        </QueryBoundary>
      </Card>
    </div>
  )
}

export const MultiplierMonitorPage = ({
  currentAccountId,
  accounts,
}: {
  currentAccountId: string
  accounts: AdvertiserAccount[]
}) => {
  const tasks = useMonitorTasks({
    currentAccountId,
    availableAccountIds: accounts.map((account) => String(account.advertiserId)),
    enabled: true,
  })
  const list = tasks.query.data?.tasks || []
  const summary = useMemo(
    () => ({
      running: list.filter((task) => task.status === 'RUNNING').length,
      triggered: list.filter((task) => task.lastResult?.status === 'TRIGGERED').length,
      errors: list.filter((task) => task.lastResult?.status === 'ERROR').length,
    }),
    [list],
  )
  return (
    <div className="workspace-page">
      <WorkspacePageHeader title="乘方监控" description="复用推广监控任务执行结果，不复制另一套任务 CRUD。" />
      <SummaryCards
        items={[
          { title: '当前页任务', value: list.length, suffix: '条' },
          { title: '运行中', value: summary.running },
          { title: '已触发', value: summary.triggered },
          { title: '错误', value: summary.errors },
        ]}
      />
      <Card bordered={false}>
        <Alert type="info" content="需要创建或编辑监控任务时，请进入推广监控管理。" />
        <QueryBoundary
          pending={tasks.query.isPending}
          error={tasks.query.isError}
          ok={tasks.query.data?.ok}
          message={tasks.query.data?.message}
          empty={!list.length}
          onRetry={() => void tasks.query.refetch()}
        >
          <Table
            rowKey="id"
            columns={[
              { title: '计划', dataIndex: 'promotionPlanName' },
              {
                title: '规则',
                render: (_: unknown, task) => `${task.rule.metric} ${task.rule.operator} ${task.rule.threshold}`,
              },
              {
                title: '状态',
                render: (_: unknown, task) => (
                  <Tag color={task.status === 'RUNNING' ? 'green' : 'gray'}>
                    {task.status === 'RUNNING' ? '运行中' : '已暂停'}
                  </Tag>
                ),
              },
              { title: '最近结果', render: (_: unknown, task) => task.lastResult?.message || '等待检查' },
            ]}
            data={list}
            pagination={false}
          />
        </QueryBoundary>
      </Card>
    </div>
  )
}

export const MultiplierDataPage = ({ currentAccountId }: { currentAccountId: string }) => {
  const query = useWorkspacePlans(currentAccountId, 'OVERALL_PROJECT')
  const summary = summarizePromotionPlans(query.data?.plans || [])
  return (
    <div className="workspace-page">
      <WorkspacePageHeader title="乘方数据" description="按全域计划场景汇总当前查询日指标，数据来源与推广数据一致。" />
      <SummaryCards
        items={[
          { title: '全域计划', value: summary.planCount, suffix: '个' },
          { title: '总消耗', value: `${summary.totalCostYuan.toFixed(2)} 元` },
          { title: '综合 ROI', value: summary.weightedPayRoi.toFixed(2) },
          { title: '有消耗计划', value: summary.spendingCount, suffix: '个' },
        ]}
      />
      <Card bordered={false}>
        <QueryBoundary
          pending={query.isPending}
          error={query.isError}
          ok={query.data?.ok}
          message={query.data?.message}
          empty={!query.data?.plans?.length}
          onRetry={() => void query.refetch()}
        >
          <Alert type="success" content="以上指标仅代表当前查询日的官方列表返回数据，不推断额外归因口径。" />
        </QueryBoundary>
      </Card>
    </div>
  )
}
