import { Button, Message, Select, Space, Switch, Typography } from '@arco-design/web-react'
import { IconRefresh } from '@arco-design/web-react/icon'

const { Text } = Typography

type MonitorToolbarProps = {
  selectedCount: number
  monitorInterval: string
  autoCleanupEnabled: boolean
  refreshing: boolean
  onIntervalChange: (value: string) => void
  onToggleAutoCleanup: () => void
  onRefresh: () => void
  onWriteAction: () => void
}

/** 批量操作目前是只读保护层，未来接入真实写接口时只替换回调。 */
export const MonitorToolbar = ({
  selectedCount,
  monitorInterval,
  autoCleanupEnabled,
  refreshing,
  onIntervalChange,
  onToggleAutoCleanup,
  onRefresh,
  onWriteAction,
}: MonitorToolbarProps) => (
  <div className="monitor-toolbar">
    <div className="batch-actions">
      <Text>
        已勾选 <b>{selectedCount}</b> 项监控
      </Text>
      <i />
      {['▶ 批量开启', '⊙ 批量停止', '♙ 批量删除', '✧ 加入分组'].map((label) => (
        <Button
          key={label}
          type="text"
          status={label.includes('停止') || label.includes('删除') ? 'danger' : 'default'}
          onClick={onWriteAction}
        >
          {label}
        </Button>
      ))}
    </div>
    <Space>
      <Text>监控间隔：</Text>
      <Select
        size="small"
        value={monitorInterval}
        onChange={onIntervalChange}
        options={['1', '5', '10'].map((value) => ({
          value,
          label: `${value}分钟`,
        }))}
      />
      <Text>自动清理失效监控</Text>
      <Switch
        checked={autoCleanupEnabled}
        onChange={() => {
          onToggleAutoCleanup()
          Message.info('自动清理开关已保存为界面配置，自动化执行将在后续版本接入。')
        }}
      />
      <Button type="outline" icon={<IconRefresh />} loading={refreshing} onClick={onRefresh}>
        刷新
      </Button>
    </Space>
  </div>
)
