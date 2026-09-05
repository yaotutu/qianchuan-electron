import { Button, Message, Typography } from '@arco-design/web-react'
import type { PromotionMonitorTab } from '../model'

const { Text } = Typography

type MonitorHeaderProps = {
  tab: PromotionMonitorTab
  total: number
  accountCount: number
  onTabChange: (tab: PromotionMonitorTab) => void
}

/** 推广监控页面头部，保留创建和管理两个稳定入口。 */
export const MonitorHeader = ({ tab, total, accountCount, onTabChange }: MonitorHeaderProps) => (
  <header className="page-tabs-header">
    <div className="page-tabs">
      <Button type={tab === 'create' ? 'primary' : 'text'} onClick={() => onTabChange('create')}>
        推广监控创建
      </Button>
      <Button type={tab === 'manage' ? 'primary' : 'text'} onClick={() => onTabChange('manage')}>
        推广监控管理
      </Button>
    </div>
    <Text className="monitoring-summary">
      ⌁ <b>{total.toLocaleString('zh-CN')}</b> 项计划监控中，已为 <b>{accountCount}</b> 个账号提供监控保障
    </Text>
    <div className="page-header-links">
      <Button type="text" onClick={() => Message.info('升级计划将在套餐系统接入后开放。')}>
        体验升级计划
      </Button>
      <Button type="text" onClick={() => Message.info('使用教程正在整理中。')}>
        使用教程
      </Button>
    </div>
  </header>
)
