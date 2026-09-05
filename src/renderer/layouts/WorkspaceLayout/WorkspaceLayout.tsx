import { useEffect, useMemo } from 'react'
import { Avatar, Badge, Button, Card, Layout, Menu, Tag, Typography } from '@arco-design/web-react'
import {
  IconApps,
  IconCaretDown,
  IconDashboard,
  IconExperiment,
  IconRefresh,
  IconSettings,
  IconUser,
} from '@arco-design/web-react/icon'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AuthorizationResult, AdvertiserAccount } from '../../shared/model/qianchuan'
import { useWorkspaceStore } from '../../app/store'
import { WorkspaceRoutes } from '../../app/router'
import { showInfoFeedback } from '../../shared/ui/feedback'
import { AccountSelector } from './components/AccountSelector'

const { Sider, Content } = Layout
const { Text } = Typography

const mainNav = [
  { key: 'account-management', label: '账号管理', icon: <IconUser /> },
  {
    key: 'promotion-management',
    label: '推广管理',
    icon: <IconSettings />,
    notice: true,
  },
  { key: 'promotion-monitor', label: '推广监控', icon: <IconDashboard /> },
  { key: 'promotion-data', label: '推广数据', icon: <IconExperiment /> },
]

const multiplierNav = [
  {
    key: 'multiplier-management',
    label: '乘方管理',
    icon: <IconSettings />,
    notice: true,
  },
  { key: 'multiplier-monitor', label: '乘方监控', icon: <IconDashboard /> },
  { key: 'multiplier-data', label: '乘方数据', icon: <IconExperiment /> },
]

type WorkspaceLayoutProps = {
  authorization: AuthorizationResult
  onReauthorize: () => void
}

/** 千川工作台骨架：只负责导航、账号选择和页面容器，不承载计划查询细节。 */
export const WorkspaceLayout = ({ authorization, onReauthorize }: WorkspaceLayoutProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const currentView = location.pathname.replace(/^\//, '') || 'promotion-monitor'
  const {
    currentAdvertiserId,
    selectedAdvertiserIds,
    accountSearch,
    setCurrentAdvertiserId,
    setSelectedAdvertiserIds,
    toggleAdvertiser,
    setAccountSearch,
    runningPlanCount,
    accountSelectionInitialized,
    setAccountSelectionInitialized,
  } = useWorkspaceStore()
  const accounts = authorization.token?.advertiserAccounts || []
  const advertiserIds = authorization.token?.advertiserIds || accounts.map((account) => account.advertiserId)
  const normalizedAccounts = useMemo(() => {
    const accountMap = new Map(accounts.map((account) => [String(account.advertiserId), account]))
    return advertiserIds.map((id) => accountMap.get(String(id)) || { advertiserId: String(id) })
  }, [accounts, advertiserIds])

  // 首次进入工作台时默认选中全部授权账号，并把第一家店铺作为当前查询账号。
  // 后续授权账号列表变化时，只清理失效 ID，不覆盖用户主动取消全选的空状态。
  useEffect(() => {
    const allIds = normalizedAccounts.map((account) => String(account.advertiserId))
    const validSelectedIds = selectedAdvertiserIds.filter((id) => allIds.includes(id))

    if (!accountSelectionInitialized && allIds.length) {
      setSelectedAdvertiserIds(allIds)
      setAccountSelectionInitialized(true)
    } else if (validSelectedIds.length !== selectedAdvertiserIds.length) {
      // 重新授权后如果原选择全部失效，则默认选中新账号，避免界面停留在“已选 0 个”。
      setSelectedAdvertiserIds(
        selectedAdvertiserIds.length > 0 && validSelectedIds.length === 0 ? allIds : validSelectedIds,
      )
    }

    if (allIds.length && (!currentAdvertiserId || !allIds.includes(currentAdvertiserId))) {
      setCurrentAdvertiserId(allIds[0])
    }
  }, [
    accountSelectionInitialized,
    currentAdvertiserId,
    normalizedAccounts,
    selectedAdvertiserIds,
    setAccountSelectionInitialized,
    setCurrentAdvertiserId,
    setSelectedAdvertiserIds,
  ])

  const currentAccountId = currentAdvertiserId || normalizedAccounts[0]?.advertiserId || ''

  const go = (key: string) => navigate(`/${key}`)
  const selectAccount = (advertiserId: string) => {
    setCurrentAdvertiserId(advertiserId)
    if (!selectedAdvertiserIds.includes(advertiserId)) toggleAdvertiser(advertiserId)

    // 在推广监控页切换左侧账号时同步更新 URL，保证刷新后仍查询同一家店铺。
    if (currentView === 'promotion-monitor') {
      const params = new URLSearchParams(location.search)
      params.set('account', advertiserId)
      params.delete('page')
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true })
    }
  }
  const toggleAll = () => {
    const allIds = normalizedAccounts.map((account) => String(account.advertiserId))
    setSelectedAdvertiserIds(selectedAdvertiserIds.length === allIds.length ? [] : allIds)
  }

  return (
    <Layout className="workspace-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark">奇</span>
          <strong>电小奇客户端</strong>
          <Text type="secondary">V0.2.0</Text>
        </div>
        <span className="topbar-divider" />
        <Button className="product-switcher" type="text" icon={<span className="product-switcher-icon">川</span>}>
          千川超级商品卡 <IconCaretDown />
        </Button>
        <div className="topbar-center">
          <Badge count={0} dot>
            <span className="running-status">
              <IconDashboard /> {runningPlanCount.toLocaleString('zh-CN')} 项推广计划监控中 <IconCaretDown />
            </span>
          </Badge>
          <span className="automation-status">
            <IconApps /> 暂无运行中自动化流程 <IconCaretDown />
          </span>
        </div>
        <div className="topbar-actions">
          <span className="service-status">
            <i /> 登录服务正常
          </span>
          <span className="top-user">
            <Avatar size={28}>{(authorization.user?.displayName || '千').slice(0, 1)}</Avatar>
            {authorization.user?.displayName || '千川用户'}
          </span>
          <Button type="outline" size="small" onClick={onReauthorize}>
            重新授权
          </Button>
        </div>
      </header>

      <Layout className="workspace-body">
        <Sider className="primary-sidebar" width={164} collapsedWidth={164}>
          <div className="sidebar-scroll">
            <div className="sidebar-product">
              <span className="qianchuan-logo">川</span>
              <strong>千川超级商品卡</strong>
              <IconCaretDown />
            </div>
            <Text className="nav-section-label">全域推广</Text>
            <Menu selectedKeys={[currentView]} onClickMenuItem={go} className="module-nav">
              {mainNav.map((item) => (
                <Menu.Item key={item.key}>
                  <span className="menu-item-content">
                    {item.icon}
                    {item.label}
                    {item.notice && <span className="nav-notice" />}
                  </span>
                </Menu.Item>
              ))}
            </Menu>
            <Text className="nav-section-label">千川乘方</Text>
            <Menu selectedKeys={[currentView]} onClickMenuItem={go} className="module-nav">
              {multiplierNav.map((item) => (
                <Menu.Item key={item.key}>
                  <span className="menu-item-content">
                    {item.icon}
                    {item.label}
                    {item.notice && <span className="nav-notice" />}
                  </span>
                </Menu.Item>
              ))}
            </Menu>
          </div>
          <div className="sidebar-footer">千川超级商品卡 · 内测版</div>
        </Sider>

        <Sider className="account-panel" width={246} collapsedWidth={246}>
          <AccountSelector
            accounts={normalizedAccounts}
            currentAccountId={currentAccountId}
            selectedAdvertiserIds={selectedAdvertiserIds}
            searchKeyword={accountSearch}
            onSearchKeywordChange={setAccountSearch}
            onSelectAccount={selectAccount}
            onToggleAdvertiser={toggleAdvertiser}
            onToggleAll={toggleAll}
            onReauthorize={onReauthorize}
            onSubscription={() => showInfoFeedback('订购和套餐管理将在商业化模块接入后开放。')}
          />
        </Sider>

        <Content className="workspace-content">
          <WorkspaceRoutes accounts={normalizedAccounts} currentAccountId={currentAccountId} />
        </Content>
      </Layout>
    </Layout>
  )
}
