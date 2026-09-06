import { Button, Input, Select } from '@arco-design/web-react'
import { IconRefresh, IconSearch } from '@arco-design/web-react/icon'
import type { AdvertiserAccount, MonitorTaskFilters } from '../../../../shared/contracts'
import { getAccountName } from '../model'

type MonitorFiltersProps = {
  accounts: AdvertiserAccount[]
  advertiserId: string
  keyword: string
  status: MonitorTaskFilters['status']
  metric: MonitorTaskFilters['metric']
  action: MonitorTaskFilters['action']
  onAdvertiserChange: (value: string) => void
  onKeywordChange: (value: string) => void
  onStatusChange: (value: MonitorTaskFilters['status']) => void
  onMetricChange: (value: MonitorTaskFilters['metric']) => void
  onActionChange: (value: MonitorTaskFilters['action']) => void
  onReset: () => void
}

/** 管理页筛选的是本地监控任务，不再把平台投放状态误当成任务状态。 */
export const MonitorFilters = ({
  accounts,
  advertiserId,
  keyword,
  status,
  metric,
  action,
  onAdvertiserChange,
  onKeywordChange,
  onStatusChange,
  onMetricChange,
  onActionChange,
  onReset,
}: MonitorFiltersProps) => (
  <div className="monitor-filter-form task-filter-form">
    <label>
      <span>所属千川</span>
      <Select
        value={advertiserId}
        onChange={onAdvertiserChange}
        options={accounts.map((account) => ({
          label: getAccountName(accounts, account.advertiserId),
          value: String(account.advertiserId),
        }))}
      />
    </label>
    <label>
      <span>任务状态</span>
      <Select
        value={status}
        onChange={onStatusChange}
        options={[
          { value: 'ALL', label: '全部状态' },
          { value: 'RUNNING', label: '监控中' },
          { value: 'PAUSED', label: '已暂停' },
        ]}
      />
    </label>
    <label>
      <span>监控指标</span>
      <Select
        value={metric}
        onChange={onMetricChange}
        options={[
          { value: 'ALL', label: '全部指标' },
          { value: 'ROI', label: '支付 ROI' },
          { value: 'COST', label: '消耗' },
          { value: 'BUDGET', label: '预算' },
        ]}
      />
    </label>
    <label>
      <span>执行动作</span>
      <Select
        value={action}
        onChange={onActionChange}
        options={[
          { value: 'ALL', label: '全部动作' },
          { value: 'NOTICE', label: '通知 / 记录' },
        ]}
      />
    </label>
    <label className="task-keyword-field">
      <span>任务或计划信息</span>
      <Input
        value={keyword}
        onChange={onKeywordChange}
        prefix={<IconSearch />}
        allowClear
        placeholder="搜索计划名称、计划 ID、商品或分组"
      />
    </label>
    <div className="filter-actions">
      <Button type="outline" icon={<IconRefresh />} onClick={onReset}>
        重置筛选
      </Button>
    </div>
  </div>
)
