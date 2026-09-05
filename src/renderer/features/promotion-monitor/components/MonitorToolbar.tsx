import { Button, Space, Typography } from '@arco-design/web-react'
import { IconDelete, IconPause, IconPlayArrow, IconRefresh, IconThunderbolt } from '@arco-design/web-react/icon'

const { Text } = Typography

type MonitorToolbarProps = {
  selectedCount: number
  refreshing: boolean
  checking: boolean
  onRefresh: () => void
  onRunNow: () => void
  onBatchStatus: (status: 'RUNNING' | 'PAUSED') => void
  onBatchDelete: () => void
}

/** 工具栏只操作本地监控任务；“开启/暂停”不会调用千川真实计划写接口。 */
export const MonitorToolbar = ({
  selectedCount,
  refreshing,
  checking,
  onRefresh,
  onRunNow,
  onBatchStatus,
  onBatchDelete,
}: MonitorToolbarProps) => (
  <div className="monitor-toolbar">
    <div className="batch-actions">
      <Text>
        已勾选 <b>{selectedCount}</b> 项任务
      </Text>
      <i />
      <Button type="text" icon={<IconPlayArrow />} disabled={!selectedCount} onClick={() => onBatchStatus('RUNNING')}>
        批量启用
      </Button>
      <Button
        type="text"
        icon={<IconPause />}
        status="warning"
        disabled={!selectedCount}
        onClick={() => onBatchStatus('PAUSED')}
      >
        批量暂停
      </Button>
      <Button type="text" icon={<IconDelete />} status="danger" disabled={!selectedCount} onClick={onBatchDelete}>
        批量删除
      </Button>
    </div>
    <Space>
      <Text type="secondary">任务数据保存在本机</Text>
      <Button type="primary" icon={<IconThunderbolt />} loading={checking} onClick={onRunNow}>
        立即检查
      </Button>
      <Button type="outline" icon={<IconRefresh />} loading={refreshing} onClick={onRefresh}>
        刷新列表
      </Button>
    </Space>
  </div>
)
