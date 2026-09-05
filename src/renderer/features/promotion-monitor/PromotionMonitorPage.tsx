import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, DatePicker, Empty, Input, Message, Pagination, Select, Space, Spin, Switch, Table, Tag, Typography } from '@arco-design/web-react'
import type { ColumnProps } from '@arco-design/web-react/es/Table'
import { IconDown, IconRefresh, IconSearch, IconUp } from '@arco-design/web-react/icon'
import { useQuery } from '@tanstack/react-query'
import { useWorkspaceStore } from '../../app/store'
import { qianchuanApi } from '../../shared/api/qianchuan-api'
import type { AdvertiserAccount, PromotionPlan, PromotionPlanFilters } from '../../shared/model/qianchuan'
import { formatDateRange, formatDateTime, formatMetric, formatMoney } from '../../shared/utils/format'

const { RangePicker } = DatePicker
const { Title, Text } = Typography
const PAGE_SIZE = 20
const statusLabels: Record<string, string> = {
  ALL: '全部状态', DELIVERY_OK: '投放中', DISABLE: '已暂停', AUDIT: '审核中', TIME_DONE: '已完成', OFFLINE_BUDGET: '预算不足', ALL_INCLUDE_DELETED: '包含已删除', FROZEN: '已终止', REAUDIT: '修改审核中', DELETED: '已删除',
}

const accountName = (accounts: AdvertiserAccount[], id?: string) => {
  const account = accounts.find((item) => String(item.advertiserId) === String(id))
  return account?.advertiserName || account?.shopName || (id ? `广告主 ${id}` : '—')
}

type PromotionMonitorPageProps = {
  currentView: string
  currentAccountId: string
  accounts: AdvertiserAccount[]
  onNavigate: (path: string) => void
}

/** 推广监控只依赖当前账号和筛选条件，列表查询与其余布局完全解耦。 */
export const PromotionMonitorPage = ({ currentView, currentAccountId, accounts, onNavigate }: PromotionMonitorPageProps) => {
  const [tab, setTab] = useState<'manage' | 'create'>('manage')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('ALL')
  const [scene, setScene] = useState('UNI_PROJECT')
  const [dates, setDates] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [monitorInterval, setMonitorInterval] = useState('1')
  const {
    selectedPlanIds,
    setSelectedPlanIds,
    currentAdvertiserId,
    filtersCollapsed,
    autoCleanupEnabled,
    toggleFiltersCollapsed,
    toggleAutoCleanup,
    setRunningPlanCount,
  } = useWorkspaceStore()
  const advertiserId = currentAdvertiserId || currentAccountId
  const filters = useMemo<PromotionPlanFilters>(() => ({
    advertiser_id: advertiserId,
    keyword: keyword.trim(),
    status,
    scene,
    start_date: dates[0] || '',
    end_date: dates[1] || '',
    page,
    page_size: PAGE_SIZE,
  }), [advertiserId, dates, keyword, page, scene, status])
  const plansQuery = useQuery({
    queryKey: ['promotion-monitor', 'plans', filters],
    queryFn: () => qianchuanApi.listPromotionPlans(filters),
    enabled: Boolean(advertiserId) && currentView === 'promotion-monitor' && tab === 'manage',
  })
  const plans = plansQuery.data?.plans || []
  const total = Number(plansQuery.data?.page?.total || 0)
  const totalPages = Math.max(1, Number(plansQuery.data?.page?.totalPages || Math.ceil(total / PAGE_SIZE) || 1))
  const selectedVisible = plans.filter((plan) => selectedPlanIds.includes(plan.id)).length

  useEffect(() => {
    setRunningPlanCount(total)
  }, [setRunningPlanCount, total])

  useEffect(() => {
    if (plansQuery.data?.status === 'reauthorization_required') Message.error('授权已失效，请重新登录后再查看计划。')
  }, [plansQuery.data?.status])

  const runSearch = () => setPage(1)
  const resetFilters = () => { setKeyword(''); setStatus('ALL'); setScene('UNI_PROJECT'); setDates([]); setPage(1) }
  const showWriteMessage = () => Message.info('当前仅接入推广监控读取，写操作将在对应平台接口接入后开放。')
  const toggleCurrentPage = (checked: boolean) => setSelectedPlanIds(checked ? plans.map((plan) => plan.id) : [])

  const columns: ColumnProps<PromotionPlan>[] = [
    { title: <Checkbox checked={plans.length > 0 && selectedVisible === plans.length} indeterminate={selectedVisible > 0 && selectedVisible < plans.length} onChange={toggleCurrentPage} />, width: 48, render: (_, plan) => <Checkbox checked={selectedPlanIds.includes(plan.id)} onChange={() => useWorkspaceStore.getState().togglePlan(plan.id)} /> },
    { title: '监控计划名', width: 280, render: (_, plan) => {
      const product = plan.products?.[0]
      return <div className="plan-main"><div className="product-image">{product?.image ? <img src={product.image} alt={product.name || '商品预览图'} /> : '图'}</div><div className="plan-copy"><strong>{plan.name || '未命名计划'}</strong><span>全域推广 · ID {plan.id}</span></div></div>
    } },
    { title: '所属千川', width: 150, dataIndex: 'advertiserId', render: (id) => accountName(accounts, id || advertiserId) },
    { title: '监控状态', width: 110, dataIndex: 'status', render: (value) => <Tag color={value === 'DELIVERY_OK' ? 'green' : ['AUDIT', 'REAUDIT'].includes(value) ? 'orange' : 'gray'}>{statusLabels[value] || value || '未知'}</Tag> },
    { title: '分组名', width: 90, render: () => <Text type="secondary">未分组</Text> },
    { title: '执行日志', width: 210, render: (_, plan) => <div className="execution-log"><span>同步成功 · 消耗 {formatMoney(plan.metrics?.costYuan)}</span><small>{formatDateTime(plan.createTime)} · ROI {formatMetric(plan.metrics?.payRoi)}</small></div> },
    { title: '操作', width: 220, render: () => <Space size="mini"><Button type="text" size="mini" onClick={showWriteMessage}>详情</Button><Button type="text" size="mini" onClick={showWriteMessage}>编辑</Button><Button type="text" size="mini" onClick={showWriteMessage}>开始</Button><Button type="text" size="mini" onClick={showWriteMessage}>复制</Button><Button type="text" status="danger" size="mini" onClick={showWriteMessage}>删除</Button></Space> },
  ]

  if (currentView !== 'promotion-monitor') {
    const placeholderMap: Record<string, [string, string, string]> = {
      'account-management': ['账', '账号管理', '这里将集中管理千川广告主、授权关系和账号状态。'],
      'promotion-management': ['投', '推广管理', '这里将承载全域推广计划的创建、编辑、复制和批量操作。'],
      'promotion-data': ['数', '推广数据', '这里将展示投放消耗、成交、ROI 和商品维度的数据分析。'],
      'multiplier-management': ['乘', '乘方管理', '千川乘方计划管理页面已经预留。'],
      'multiplier-monitor': ['监', '乘方监控', '千川乘方监控将沿用当前账号体系和监控工作流。'],
      'multiplier-data': ['析', '乘方数据', '千川乘方的数据看板和报表能力将在后续版本接入。'],
    }
    const [icon, title, description] = placeholderMap[currentView] || placeholderMap['promotion-data']
    return <div className="feature-placeholder"><div className="placeholder-icon">{icon}</div><Title heading={2}>{title}</Title><Text type="secondary">{description}</Text><Button type="primary" onClick={() => onNavigate('promotion-monitor')}>返回推广监控</Button></div>
  }

  return <div className="monitoring-view">
    <header className="page-tabs-header"><div className="page-tabs"><Button type={tab === 'create' ? 'text' : 'primary'} onClick={() => setTab('create')}>推广监控创建</Button><Button type={tab === 'manage' ? 'primary' : 'text'} onClick={() => setTab('manage')}>推广监控管理</Button></div><Text className="monitoring-summary">⌁ <b>{total.toLocaleString('zh-CN')}</b> 项计划监控中，已为 <b>{accounts.length}</b> 个账号提供监控保障</Text><div className="page-header-links"><Button type="text" onClick={() => Message.info('升级计划将在套餐系统接入后开放。')}>体验升级计划</Button><Button type="text" onClick={() => Message.info('使用教程正在整理中。')}>使用教程</Button></div></header>
    {tab === 'create' ? <div className="feature-placeholder"><div className="placeholder-icon">＋</div><Title heading={2}>推广监控创建</Title><Text type="secondary">页面结构已经预留。下一阶段接入监控规则、执行动作和计划创建接口。</Text><Button onClick={() => setTab('manage')}>返回监控管理</Button></div> : <Card className="monitor-panel" bordered={false}>
      <form className={`monitor-filter-form ${filtersCollapsed ? 'is-collapsed' : ''}`} onSubmit={(event) => { event.preventDefault(); runSearch() }}>
        <label><span>所属千川</span><Select value={advertiserId} onChange={(value) => { useWorkspaceStore.getState().setCurrentAdvertiserId(value); setPage(1) }} options={accounts.map((account) => ({ label: accountName(accounts, account.advertiserId), value: String(account.advertiserId) }))} /></label>
        <label><span>监控状态</span><Select value={status} onChange={(value) => { setStatus(value); setPage(1) }} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></label>
        <label><span>计划信息</span><Input value={keyword} onChange={setKeyword} placeholder="请输入计划名称/ID" /></label>
        <label><span>条件范围</span><Select value={scene} onChange={(value) => { setScene(value); setPage(1) }} options={[{ value: 'UNI_PROJECT', label: '全域推广' }, { value: 'OVERALL_PROJECT', label: '千川乘方' }]} /></label>
        <label><span>监控规则</span><Select defaultValue="ALL" options={[{ value: 'ALL', label: '全部规则' }, { value: 'ROI', label: 'ROI 监控' }, { value: 'COST', label: '消耗监控' }, { value: 'BUDGET', label: '预算监控' }]} /></label>
        <label><span>执行操作</span><Select defaultValue="ALL" options={[{ value: 'ALL', label: '全部操作' }, { value: 'PAUSE', label: '暂停计划' }, { value: 'ENABLE', label: '开启计划' }, { value: 'NOTICE', label: '仅通知' }]} /></label>
        <label className="date-filter-field"><span>创建时间</span><RangePicker value={dates} onChange={setDates} /></label>
        <div className="filter-actions"><Button htmlType="submit" type="primary" icon={<IconSearch />}>搜索</Button><Button type="outline" icon={<IconRefresh />} onClick={resetFilters}>重置</Button><Button type="text" onClick={toggleFiltersCollapsed}>{filtersCollapsed ? <><IconDown />展开</> : <><IconUp />收起</>}</Button></div>
      </form>
      <div className="monitor-toolbar"><div className="batch-actions"><Text>已勾选 <b>{selectedPlanIds.length}</b> 项监控</Text><i />{['▶ 批量开启', '⊙ 批量停止', '♙ 批量删除', '✧ 加入分组'].map((label) => <Button key={label} type="text" status={label.includes('停止') || label.includes('删除') ? 'danger' : 'default'} onClick={showWriteMessage}>{label}</Button>)}</div><Space><Text>监控间隔：</Text><Select size="small" value={monitorInterval} onChange={setMonitorInterval} options={['1', '5', '10'].map((value) => ({ value, label: `${value}分钟` }))} /><Text>自动清理失效监控</Text><Switch checked={autoCleanupEnabled} onChange={() => { toggleAutoCleanup(); Message.info('自动清理开关已保存为界面配置，自动化执行将在后续版本接入。') }} /><Button type="outline" icon={<IconRefresh />} loading={plansQuery.isFetching} onClick={() => void plansQuery.refetch()}>刷新</Button></Space></div>
      {plansQuery.isError && <Alert type="error" content="获取投放计划失败，请稍后重试。" />}
      {plansQuery.data?.ok === false && <Alert type="error" content={plansQuery.data.message || '获取投放计划失败。'} />}
      <div className="monitor-table-card"><Table rowKey="id" columns={columns} data={plans} pagination={false} scroll={{ x: 1_250 }} loading={{ loading: plansQuery.isPending, tip: '正在同步…' }} noDataElement={<Empty description="暂时没有推广监控计划" />} />{plans.length > 0 && <div className="pagination"><div><span>本页 {plans.length} 条，共 {total} 条</span><span className="sync-state">{plansQuery.isFetching ? '正在同步…' : `更新于 ${formatDateTime(new Date().toISOString())}`}</span><span className="query-range">{formatDateRange(plansQuery.data?.query?.startDate || plansQuery.data?.query?.start_date, plansQuery.data?.query?.endDate || plansQuery.data?.query?.end_date)}</span></div><Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={(nextPage) => { setSelectedPlanIds([]); setPage(nextPage) }} showTotal={false} /></div>}</div>
    </Card>}
  </div>
}
