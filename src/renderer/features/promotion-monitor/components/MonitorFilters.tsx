import { Button, DatePicker, Input, Select } from '@arco-design/web-react'
import { IconDown, IconRefresh, IconSearch, IconUp } from '@arco-design/web-react/icon'
import type { AdvertiserAccount } from '../../../shared/model/qianchuan'
import { getAccountName, PROMOTION_STATUS_LABELS } from '../model'

const { RangePicker } = DatePicker

type MonitorFiltersProps = {
  accounts: AdvertiserAccount[]
  advertiserId: string
  keyword: string
  status: string
  scene: string
  dates: string[]
  collapsed: boolean
  onAdvertiserChange: (value: string) => void
  onKeywordChange: (value: string) => void
  onStatusChange: (value: string) => void
  onSceneChange: (value: string) => void
  onDatesChange: (value: string[]) => void
  onSearch: () => void
  onReset: () => void
  onToggleCollapsed: () => void
}

/** 读取筛选区只负责收集用户输入，不直接参与 Query 请求。 */
export const MonitorFilters = ({
  accounts,
  advertiserId,
  keyword,
  status,
  scene,
  dates,
  collapsed,
  onAdvertiserChange,
  onKeywordChange,
  onStatusChange,
  onSceneChange,
  onDatesChange,
  onSearch,
  onReset,
  onToggleCollapsed,
}: MonitorFiltersProps) => (
  <form
    className={`monitor-filter-form ${collapsed ? 'is-collapsed' : ''}`}
    onSubmit={(event) => {
      event.preventDefault()
      onSearch()
    }}
  >
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
      <span>监控状态</span>
      <Select
        value={status}
        onChange={onStatusChange}
        options={Object.entries(PROMOTION_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      />
    </label>
    <label>
      <span>计划信息</span>
      <Input value={keyword} onChange={onKeywordChange} placeholder="请输入计划名称/ID" />
    </label>
    <label>
      <span>条件范围</span>
      <Select
        value={scene}
        onChange={onSceneChange}
        options={[
          { value: 'UNI_PROJECT', label: '全域推广' },
          { value: 'OVERALL_PROJECT', label: '千川乘方' },
        ]}
      />
    </label>
    <label>
      <span>监控规则</span>
      <Select
        defaultValue="ALL"
        options={[
          { value: 'ALL', label: '全部规则' },
          { value: 'ROI', label: 'ROI 监控' },
          { value: 'COST', label: '消耗监控' },
          { value: 'BUDGET', label: '预算监控' },
        ]}
      />
    </label>
    <label>
      <span>执行操作</span>
      <Select
        defaultValue="ALL"
        options={[
          { value: 'ALL', label: '全部操作' },
          { value: 'PAUSE', label: '暂停计划' },
          { value: 'ENABLE', label: '开启计划' },
          { value: 'NOTICE', label: '仅通知' },
        ]}
      />
    </label>
    <label className="date-filter-field">
      <span>创建时间</span>
      <RangePicker value={dates} onChange={onDatesChange} />
    </label>
    <div className="filter-actions">
      <Button htmlType="submit" type="primary" icon={<IconSearch />}>
        搜索
      </Button>
      <Button type="outline" icon={<IconRefresh />} onClick={onReset}>
        重置
      </Button>
      <Button type="text" onClick={onToggleCollapsed}>
        {collapsed ? (
          <>
            <IconDown />
            展开
          </>
        ) : (
          <>
            <IconUp />
            收起
          </>
        )}
      </Button>
    </div>
  </form>
)
