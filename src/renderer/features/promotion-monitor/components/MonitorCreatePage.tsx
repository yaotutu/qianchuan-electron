import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Typography,
} from '@arco-design/web-react'
import type { ColumnProps } from '@arco-design/web-react/es/Table'
import { queryClient } from '../../../app/query-client'
import { qianchuanApi } from '../../../shared/api/qianchuan-api'
import type { AdvertiserAccount, MonitorRule, PromotionPlan } from '../../../shared/model/qianchuan'
import { showErrorFeedback, showSuccessFeedback } from '../../../shared/ui/feedback'
import { getAccountName } from '../model'

const { Title, Text } = Typography
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

type MonitorCreatePageProps = {
  advertiserId: string
  accounts: AdvertiserAccount[]
  onAdvertiserChange: (value: string) => void
  onBack: () => void
}

/** 创建页先读取真实千川商品投放计划，再把计划快照交给 Electron 本地任务仓库。 */
export const MonitorCreatePage = ({ advertiserId, accounts, onAdvertiserChange, onBack }: MonitorCreatePageProps) => {
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [rule, setRule] = useState<MonitorRule>({ metric: 'ROI', operator: 'LT', threshold: 1.8 })
  const [intervalMinutes, setIntervalMinutes] = useState(5)

  const plansQuery = useQuery({
    queryKey: ['promotion-monitor', 'create-plans', advertiserId],
    queryFn: () =>
      qianchuanApi.listPromotionPlans({
        advertiser_id: advertiserId,
        keyword: '',
        status: 'ALL',
        scene: 'UNI_PROJECT',
        start_date: '',
        end_date: '',
        page: 1,
        page_size: 100,
      }),
    enabled: Boolean(advertiserId),
  })
  const plans = plansQuery.data?.plans || []
  const selectedPlans = useMemo(
    () => plans.filter((plan) => selectedPlanIds.includes(plan.id)),
    [plans, selectedPlanIds],
  )

  const createMutation = useMutation({
    mutationFn: () =>
      qianchuanApi.createMonitorTasks({
        advertiserId,
        plans: selectedPlans.map((plan) => ({
          id: plan.id,
          name: plan.name || '未命名计划',
          productName: plan.products?.[0]?.name || '',
          productImage: plan.products?.[0]?.image || '',
          status: plan.status || '',
        })),
        groupName,
        rule,
        action: 'NOTICE',
        intervalMinutes,
        status: 'RUNNING',
      }),
    onSuccess: (result) => {
      if (result.ok !== true) {
        showErrorFeedback(result.message || '创建监控任务失败。')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['promotion-monitor', 'tasks'] })
      showSuccessFeedback(`已创建 ${result.tasks?.length || selectedPlans.length} 条监控任务。`)
      setSelectedPlanIds([])
      onBack()
    },
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '创建监控任务失败。'),
  })

  const columns: ColumnProps<PromotionPlan>[] = [
    {
      title: (
        <Checkbox
          checked={plans.length > 0 && selectedPlans.length === plans.length}
          indeterminate={selectedPlans.length > 0 && selectedPlans.length < plans.length}
          onChange={(checked) => setSelectedPlanIds(checked ? plans.map((plan) => plan.id) : [])}
        />
      ),
      width: 48,
      render: (_, plan) => (
        <Checkbox
          checked={selectedPlanIds.includes(plan.id)}
          onChange={(checked) =>
            setSelectedPlanIds((current) => (checked ? [...current, plan.id] : current.filter((id) => id !== plan.id)))
          }
        />
      ),
    },
    {
      title: '商品投放计划',
      render: (_, plan) => (
        <div className="plan-main">
          <div className="product-image">
            {plan.products?.[0]?.image ? (
              <img src={plan.products[0].image} alt={plan.products[0].name || '商品图'} />
            ) : (
              '图'
            )}
          </div>
          <div className="plan-copy">
            <strong>{plan.name || '未命名计划'}</strong>
            <span>
              {plan.products?.[0]?.name || '未获取商品名称'} · ID {plan.id}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: '所属千川',
      width: 160,
      render: (_, plan) => getAccountName(accounts, plan.advertiserId || advertiserId),
    },
    {
      title: '平台状态',
      width: 120,
      render: (_, plan) => plan.status || '未知',
    },
  ]

  return (
    <div className="monitor-create-page">
      <div className="create-page-heading">
        <div>
          <Title heading={3}>创建推广监控</Title>
          <Text type="secondary">选择商品投放计划并保存本地监控规则。当前执行动作仅通知和记录，不会改动千川计划。</Text>
        </div>
        <Button type="outline" onClick={onBack}>
          返回任务管理
        </Button>
      </div>
      <Card className="monitor-create-card" bordered={false}>
        <div className="create-step-title">
          <span>1</span>
          <div>
            <strong>选择商品投放计划</strong>
            <Text type="secondary">来自当前已授权千川账号的只读数据</Text>
          </div>
        </div>
        <div className="create-plan-toolbar">
          <Select
            value={advertiserId}
            onChange={(value) => {
              onAdvertiserChange(value)
              setSelectedPlanIds([])
            }}
            options={accounts.map((account) => ({
              value: String(account.advertiserId),
              label: getAccountName(accounts, account.advertiserId),
            }))}
          />
          <Text type="secondary">
            已选择 {selectedPlans.length} 条 · 共 {plansQuery.data?.page?.total || plans.length} 条
          </Text>
        </div>
        {plansQuery.isError && (
          <Alert
            type="error"
            content="获取商品投放计划失败，请检查授权或点击重试。"
            action={
              <Button type="text" onClick={() => void plansQuery.refetch()}>
                重试
              </Button>
            }
          />
        )}
        {plansQuery.data?.ok === false && (
          <Alert type="error" content={plansQuery.data.message || '获取商品投放计划失败。'} />
        )}
        <Table
          rowKey="id"
          columns={columns}
          data={plans}
          pagination={false}
          loading={{ loading: plansQuery.isPending, tip: '正在读取商品投放计划…' }}
          noDataElement={<Empty description={advertiserId ? '当前账号暂无商品投放计划' : '请先选择千川账号'} />}
          scroll={{ y: 320 }}
        />
      </Card>
      <Card className="monitor-create-card" bordered={false}>
        <div className="create-step-title">
          <span>2</span>
          <div>
            <strong>配置监控规则</strong>
            <Text type="secondary">规则由本地 Electron 任务负责保存和后续执行</Text>
          </div>
        </div>
        <Form layout="vertical">
          <div className="rule-form-grid">
            <Form.Item label="监控指标">
              <Select
                value={rule.metric}
                options={METRIC_OPTIONS}
                onChange={(metric) => setRule((current) => ({ ...current, metric }))}
              />
            </Form.Item>
            <Form.Item label="比较条件">
              <Select
                value={rule.operator}
                options={OPERATOR_OPTIONS}
                onChange={(operator) => setRule((current) => ({ ...current, operator }))}
              />
            </Form.Item>
            <Form.Item label="触发阈值">
              <InputNumber
                min={0}
                precision={2}
                value={rule.threshold}
                onChange={(threshold) => setRule((current) => ({ ...current, threshold: Number(threshold ?? 0) }))}
              />
            </Form.Item>
            <Form.Item label="检查间隔">
              <Select
                value={String(intervalMinutes)}
                options={[1, 5, 10, 30, 60].map((value) => ({ value: String(value), label: `${value} 分钟` }))}
                onChange={(value) => setIntervalMinutes(Number(value))}
              />
            </Form.Item>
          </div>
          <Form.Item label="分组名">
            <Input
              value={groupName}
              maxLength={40}
              showWordLimit
              placeholder="可选，例如：重点商品"
              onChange={setGroupName}
            />
          </Form.Item>
        </Form>
        <div className="safe-action-note">
          执行动作：通知 / 记录。后续如需自动暂停真实计划，需要单独申请并接入平台写权限，不会由当前按钮隐式执行。
        </div>
        <div className="create-submit-row">
          <Text type="secondary">创建后可在任务管理中启停、编辑、复制和删除。</Text>
          <Space>
            <Button onClick={onBack}>取消</Button>
            <Button
              type="primary"
              loading={createMutation.isPending}
              disabled={!selectedPlans.length || !advertiserId}
              onClick={() => createMutation.mutate()}
            >
              保存 {selectedPlans.length || ''} 条监控任务
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  )
}
