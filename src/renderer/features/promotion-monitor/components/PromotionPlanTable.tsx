import { Button, Checkbox, Empty, Pagination, Space, Table, Tag, Typography } from '@arco-design/web-react'
import type { ColumnProps } from '@arco-design/web-react/es/Table'
import type { AdvertiserAccount, PromotionPlan } from '../../../shared/model/qianchuan'
import { formatDateRange, formatDateTime, formatMetric, formatMoney } from '../../../shared/utils/format'
import { PROMOTION_MONITOR_PAGE_SIZE, PROMOTION_STATUS_LABELS, getAccountName } from '../model'

const { Text } = Typography

type PromotionPlanTableProps = {
  plans: PromotionPlan[]
  accounts: AdvertiserAccount[]
  advertiserId: string
  selectedPlanIds: string[]
  total: number
  page: number
  fetching: boolean
  queryStartDate?: string
  queryEndDate?: string
  onTogglePlan: (planId: string) => void
  onTogglePage: (checked: boolean) => void
  onPageChange: (page: number) => void
  onWriteAction: () => void
}

/** 计划表格只负责渲染服务端结果，避免把数据转换和筛选逻辑堆在页面组件中。 */
export const PromotionPlanTable = ({
  plans,
  accounts,
  advertiserId,
  selectedPlanIds,
  total,
  page,
  fetching,
  queryStartDate,
  queryEndDate,
  onTogglePlan,
  onTogglePage,
  onPageChange,
  onWriteAction,
}: PromotionPlanTableProps) => {
  const selectedVisible = plans.filter((plan) => selectedPlanIds.includes(plan.id)).length
  const columns: ColumnProps<PromotionPlan>[] = [
    {
      title: (
        <Checkbox
          checked={plans.length > 0 && selectedVisible === plans.length}
          indeterminate={selectedVisible > 0 && selectedVisible < plans.length}
          onChange={onTogglePage}
        />
      ),
      width: 48,
      render: (_, plan) => (
        <Checkbox checked={selectedPlanIds.includes(plan.id)} onChange={() => onTogglePlan(plan.id)} />
      ),
    },
    {
      title: '监控计划名',
      width: 280,
      render: (_, plan) => {
        const product = plan.products?.[0]
        return (
          <div className="plan-main">
            <div className="product-image">
              {product?.image ? <img src={product.image} alt={product.name || '商品预览图'} /> : '图'}
            </div>
            <div className="plan-copy">
              <strong>{plan.name || '未命名计划'}</strong>
              <span>全域推广 · ID {plan.id}</span>
            </div>
          </div>
        )
      },
    },
    {
      title: '所属千川',
      width: 150,
      dataIndex: 'advertiserId',
      render: (id) => getAccountName(accounts, id || advertiserId),
    },
    {
      title: '监控状态',
      width: 110,
      dataIndex: 'status',
      render: (value) => (
        <Tag color={value === 'DELIVERY_OK' ? 'green' : ['AUDIT', 'REAUDIT'].includes(value) ? 'orange' : 'gray'}>
          {PROMOTION_STATUS_LABELS[value] || value || '未知'}
        </Tag>
      ),
    },
    {
      title: '分组名',
      width: 90,
      render: () => <Text type="secondary">未分组</Text>,
    },
    {
      title: '执行日志',
      width: 210,
      render: (_, plan) => (
        <div className="execution-log">
          <span>同步成功 · 消耗 {formatMoney(plan.metrics?.costYuan)}</span>
          <small>
            {formatDateTime(plan.createTime)} · ROI {formatMetric(plan.metrics?.payRoi)}
          </small>
        </div>
      ),
    },
    {
      title: '操作',
      width: 220,
      render: () => (
        <Space size="mini">
          <Button type="text" size="mini" onClick={onWriteAction}>
            详情
          </Button>
          <Button type="text" size="mini" onClick={onWriteAction}>
            编辑
          </Button>
          <Button type="text" size="mini" onClick={onWriteAction}>
            开始
          </Button>
          <Button type="text" size="mini" onClick={onWriteAction}>
            复制
          </Button>
          <Button type="text" status="danger" size="mini" onClick={onWriteAction}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="monitor-table-card">
      <Table
        rowKey="id"
        columns={columns}
        data={plans}
        pagination={false}
        scroll={{ x: 1_250 }}
        loading={{ loading: fetching, tip: '正在同步…' }}
        noDataElement={<Empty description="暂时没有推广监控计划" />}
      />
      {plans.length > 0 && (
        <div className="pagination">
          <div>
            <span>
              本页 {plans.length} 条，共 {total} 条
            </span>
            <span className="sync-state">
              {fetching ? '正在同步…' : `更新于 ${formatDateTime(new Date().toISOString())}`}
            </span>
            <span className="query-range">{formatDateRange(queryStartDate, queryEndDate)}</span>
          </div>
          <Pagination
            current={page}
            total={total}
            pageSize={PROMOTION_MONITOR_PAGE_SIZE}
            onChange={onPageChange}
            showTotal={false}
          />
        </div>
      )}
    </div>
  )
}
