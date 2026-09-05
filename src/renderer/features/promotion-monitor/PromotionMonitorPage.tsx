import { useState } from 'react'
import { Alert, Card } from '@arco-design/web-react'
import { useWorkspaceStore } from '../../app/store'
import { showReadOnlyActionFeedback } from '../../shared/ui/feedback'
import type { PromotionMonitorPageProps, PromotionMonitorTab } from './model'
import type { PromotionPlan } from '../../shared/model/qianchuan'
import { MonitorCreatePlaceholder } from './components/MonitorCreatePlaceholder'
import { MonitorFilters } from './components/MonitorFilters'
import { MonitorHeader } from './components/MonitorHeader'
import { MonitorToolbar } from './components/MonitorToolbar'
import { PromotionPlanDetailDrawer } from './components/PromotionPlanDetailDrawer'
import { PromotionPlanTable } from './components/PromotionPlanTable'
import { usePromotionPlans } from './hooks/usePromotionPlans'

/**
 * 推广监控功能入口。
 * 页面只编排独立组件；查询、筛选、表格和工具栏均拥有清晰边界，
 * 后续新增创建流程或计划写操作不会继续扩大这个文件。
 */
export const PromotionMonitorPage = ({ currentAccountId, accounts }: PromotionMonitorPageProps) => {
  const [tab, setTab] = useState<PromotionMonitorTab>('manage')
  const [monitorInterval, setMonitorInterval] = useState('1')
  const [detailPlan, setDetailPlan] = useState<PromotionPlan | null>(null)
  const {
    selectedPlanIds,
    filtersCollapsed,
    autoCleanupEnabled,
    setSelectedPlanIds,
    togglePlan,
    toggleFiltersCollapsed,
    toggleAutoCleanup,
  } = useWorkspaceStore()
  const plansState = usePromotionPlans({ currentAccountId })
  const plans = plansState.query.data?.plans || []

  // 当前阶段明确禁止在客户端直接执行真实投放写操作，避免误启停或误删除计划。
  const showWriteMessage = showReadOnlyActionFeedback
  const changeTab = (nextTab: PromotionMonitorTab) => {
    setSelectedPlanIds([])
    setTab(nextTab)
  }

  return (
    <div className="monitoring-view">
      <MonitorHeader tab={tab} total={plansState.total} accountCount={accounts.length} onTabChange={changeTab} />
      {tab === 'create' ? (
        <MonitorCreatePlaceholder onBack={() => changeTab('manage')} />
      ) : (
        <Card className="monitor-panel" bordered={false}>
          <MonitorFilters
            accounts={accounts}
            advertiserId={plansState.advertiserId}
            keyword={plansState.keyword}
            status={plansState.status}
            scene={plansState.scene}
            dates={plansState.dates}
            collapsed={filtersCollapsed}
            onAdvertiserChange={plansState.setAdvertiserId}
            onKeywordChange={plansState.setKeyword}
            onStatusChange={plansState.setStatus}
            onSceneChange={plansState.setScene}
            onDatesChange={plansState.setDates}
            onSearch={plansState.runSearch}
            onReset={plansState.resetFilters}
            onToggleCollapsed={toggleFiltersCollapsed}
          />
          <MonitorToolbar
            selectedCount={selectedPlanIds.length}
            monitorInterval={monitorInterval}
            autoCleanupEnabled={autoCleanupEnabled}
            refreshing={plansState.query.isFetching}
            onIntervalChange={setMonitorInterval}
            onToggleAutoCleanup={toggleAutoCleanup}
            onRefresh={() => void plansState.query.refetch()}
            onWriteAction={showWriteMessage}
          />
          {plansState.query.isError && <Alert type="error" content="获取投放计划失败，请稍后重试。" />}
          {plansState.query.data?.ok === false && (
            <Alert type="error" content={plansState.query.data.message || '获取投放计划失败。'} />
          )}
          <PromotionPlanTable
            plans={plans}
            accounts={accounts}
            advertiserId={plansState.advertiserId}
            selectedPlanIds={selectedPlanIds}
            total={plansState.total}
            page={plansState.page}
            fetching={plansState.query.isPending || plansState.query.isFetching}
            queryStartDate={plansState.query.data?.query?.startDate || plansState.query.data?.query?.start_date}
            queryEndDate={plansState.query.data?.query?.endDate || plansState.query.data?.query?.end_date}
            onTogglePlan={togglePlan}
            onTogglePage={(checked) => setSelectedPlanIds(checked ? plans.map((plan) => plan.id) : [])}
            onPageChange={(page) => {
              setSelectedPlanIds([])
              plansState.setPage(page)
            }}
            onWriteAction={showWriteMessage}
            onOpenDetail={setDetailPlan}
          />
        </Card>
      )}
      <PromotionPlanDetailDrawer
        plan={detailPlan}
        accounts={accounts}
        visible={Boolean(detailPlan)}
        onClose={() => setDetailPlan(null)}
      />
    </div>
  )
}
