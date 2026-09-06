import { Button, Checkbox, Empty, Pagination, Popconfirm, Space, Table, Tag, Typography } from '@arco-design/web-react'
import type { ColumnProps } from '@arco-design/web-react/es/Table'
import type { AdvertiserAccount, MonitorTask } from '../../../../shared/contracts'
import { formatDateTime } from '../../../shared/utils/format'
import { PROMOTION_MONITOR_PAGE_SIZE, getAccountName } from '../model'

const { Text } = Typography
const METRIC_LABELS = { ROI: '支付 ROI', COST: '消耗', BUDGET: '预算' }
const OPERATOR_LABELS = { GT: '>', GTE: '≥', LT: '<', LTE: '≤' }

type MonitorTaskTableProps = {
  tasks: MonitorTask[]
  accounts: AdvertiserAccount[]
  selectedTaskIds: string[]
  total: number
  page: number
  loading: boolean
  onToggleTask: (taskId: string) => void
  onTogglePage: (checked: boolean) => void
  onPageChange: (page: number) => void
  onEdit: (task: MonitorTask) => void
  onToggleStatus: (task: MonitorTask) => void
  onCopy: (task: MonitorTask) => void
  onDelete: (task: MonitorTask) => void
}

/** 管理表格展示的是本地任务模型，与平台原始计划列表保持明确区分。 */
export const MonitorTaskTable = ({
  tasks,
  accounts,
  selectedTaskIds,
  total,
  page,
  loading,
  onToggleTask,
  onTogglePage,
  onPageChange,
  onEdit,
  onToggleStatus,
  onCopy,
  onDelete,
}: MonitorTaskTableProps) => {
  const selectedVisible = tasks.filter((task) => selectedTaskIds.includes(task.id)).length
  const columns: ColumnProps<MonitorTask>[] = [
    {
      title: (
        <Checkbox
          checked={tasks.length > 0 && selectedVisible === tasks.length}
          indeterminate={selectedVisible > 0 && selectedVisible < tasks.length}
          onChange={onTogglePage}
        />
      ),
      width: 48,
      render: (_, task) => (
        <Checkbox checked={selectedTaskIds.includes(task.id)} onChange={() => onToggleTask(task.id)} />
      ),
    },
    {
      title: '监控计划',
      width: 300,
      render: (_, task) => (
        <div className="plan-main">
          <div className="product-image">
            {task.productImage ? <img src={task.productImage} alt={task.productName || '商品图'} /> : '图'}
          </div>
          <div className="plan-copy">
            <strong title={task.promotionPlanName}>{task.promotionPlanName}</strong>
            <span>
              {task.productName || '未获取商品名称'} · ID {task.promotionPlanId}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: '所属千川',
      width: 150,
      render: (_, task) => getAccountName(accounts, task.advertiserId),
    },
    {
      title: '任务状态',
      width: 105,
      render: (_, task) => (
        <Tag color={task.status === 'RUNNING' ? 'green' : 'gray'}>
          {task.status === 'RUNNING' ? '监控中' : '已暂停'}
        </Tag>
      ),
    },
    {
      title: '监控规则',
      width: 165,
      render: (_, task) => (
        <div className="execution-log">
          <strong>
            {METRIC_LABELS[task.rule.metric]} {OPERATOR_LABELS[task.rule.operator]} {task.rule.threshold}
          </strong>
          <small>每 {task.intervalMinutes} 分钟检查</small>
        </div>
      ),
    },
    {
      title: '分组',
      width: 110,
      render: (_, task) => task.groupName || <Text type="secondary">未分组</Text>,
    },
    {
      title: '最近结果',
      width: 205,
      render: (_, task) => (
        <div className="execution-log">
          <span>{task.lastResult?.message || '等待首次检查'}</span>
          <small>
            {task.lastCheckedAt ? formatDateTime(task.lastCheckedAt) : `创建于 ${formatDateTime(task.createdAt)}`}
          </small>
        </div>
      ),
    },
    {
      title: '操作',
      width: 250,
      fixed: 'right',
      render: (_, task) => (
        <Space size="mini">
          <Button type="text" size="mini" onClick={() => onEdit(task)}>
            编辑
          </Button>
          <Button
            type="text"
            size="mini"
            status={task.status === 'RUNNING' ? 'warning' : 'success'}
            onClick={() => onToggleStatus(task)}
          >
            {task.status === 'RUNNING' ? '暂停' : '启用'}
          </Button>
          <Button type="text" size="mini" onClick={() => onCopy(task)}>
            复制
          </Button>
          <Popconfirm title="确定删除这条本地监控任务吗？" onOk={() => onDelete(task)}>
            <Button type="text" status="danger" size="mini">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="monitor-table-card">
      <Table
        rowKey="id"
        columns={columns}
        data={tasks}
        pagination={false}
        scroll={{ x: 1_340 }}
        loading={{ loading, tip: '正在读取本地任务…' }}
        noDataElement={<Empty description="还没有监控任务，请先创建一条" />}
      />
      {total > 0 && (
        <div className="pagination">
          <span>
            本页 {tasks.length} 条，共 {total} 条
          </span>
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
