import { useEffect, useMemo } from 'react'
import { Avatar, Badge, Button, Card, Input, Layout, Menu, Tag, Typography } from '@arco-design/web-react'
import {
  IconApps,
  IconCaretDown,
  IconDashboard,
  IconExperiment,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconUser,
} from '@arco-design/web-react/icon'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AuthorizationResult, AdvertiserAccount } from '../../shared/model/qianchuan'
import { useWorkspaceStore } from '../../app/store'
import { WorkspaceRoutes } from '../../app/router'

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

const getAccountName = (account?: AdvertiserAccount) =>
  account?.advertiserName || account?.shopName || `广告主 ${account?.advertiserId || '—'}`

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
  } = useWorkspaceStore()
  const accounts = authorization.token?.advertiserAccounts || []
  const advertiserIds = authorization.token?.advertiserIds || accounts.map((account) => account.advertiserId)
  const normalizedAccounts = useMemo(() => {
    const accountMap = new Map(accounts.map((account) => [String(account.advertiserId), account]))
    return advertiserIds.map((id) => accountMap.get(String(id)) || { advertiserId: String(id) })
  }, [accounts, advertiserIds])
  const filteredAccounts = normalizedAccounts.filter((account) => {
    const keyword = accountSearch.trim().toLowerCase()
    if (!keyword) return true
    return [account.advertiserName, account.shopName, account.advertiserId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
  const selectedCount = selectedAdvertiserIds.length

  // 首次进入工作台时默认选中全部授权账号，并把第一家店铺作为当前查询账号。
  useEffect(() => {
    const allIds = normalizedAccounts.map((account) => String(account.advertiserId))
    if (!selectedAdvertiserIds.length && allIds.length) setSelectedAdvertiserIds(allIds)
    if (!currentAdvertiserId && allIds[0]) setCurrentAdvertiserId(allIds[0])
  }, [
    currentAdvertiserId,
    normalizedAccounts,
    selectedAdvertiserIds.length,
    setCurrentAdvertiserId,
    setSelectedAdvertiserIds,
  ])

  const currentAccountId = currentAdvertiserId || normalizedAccounts[0]?.advertiserId || ''

  const go = (key: string) => navigate(`/${key}`)
  const selectAccount = (advertiserId: string) => {
    setCurrentAdvertiserId(advertiserId)
    if (!selectedAdvertiserIds.includes(advertiserId)) toggleAdvertiser(advertiserId)
  }
  const toggleAll = () => {
    const allIds = normalizedAccounts.map((account) => String(account.advertiserId))
    setSelectedAdvertiserIds(selectedCount === allIds.length ? [] : allIds)
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
          <div className="account-panel-header">
            <Typography.Title heading={5}>账号选择</Typography.Title>
            <Button type="text" size="small" onClick={onReauthorize}>
              新账号登录
            </Button>
          </div>
          <Input.Search
            allowClear
            value={accountSearch}
            onChange={setAccountSearch}
            placeholder="请输入千川/店铺名"
            prefix={<IconSearch />}
          />
          <div className="account-selection-bar">
            <Button type="text" size="small" onClick={toggleAll}>
              {selectedCount === normalizedAccounts.length ? '取消全选' : '选择全部'}
            </Button>
            <Text type="secondary">
              已选：<b>{selectedCount}</b>
            </Text>
          </div>
          <div className="account-list">
            {filteredAccounts.length ? (
              filteredAccounts.map((account) => {
                const id = String(account.advertiserId)
                return (
                  <button
                    type="button"
                    className={`account-row ${id === currentAccountId ? 'is-current' : ''}`}
                    key={id}
                    onClick={() => selectAccount(id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAdvertiserIds.includes(id)}
                      onChange={() => toggleAdvertiser(id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`选择 ${getAccountName(account)}`}
                    />
                    <span className="account-copy">
                      <strong>{getAccountName(account)}</strong>
                      <small>🔗 已授权 · {id}</small>
                    </span>
                    <span className="account-state">
                      <b>生效</b>
                      <small>去后台</small>
                    </span>
                  </button>
                )
              })
            ) : (
              <div className="account-list-empty">没有匹配的千川账号</div>
            )}
          </div>
          <div className="account-panel-footer">
            <Text type="secondary">千川超级商品卡</Text>
            <Button type="text" size="small" onClick={() => window.alert('订购和套餐管理将在商业化模块接入后开放。')}>
              订购
            </Button>
          </div>
        </Sider>

        <Content className="workspace-content">
          <WorkspaceRoutes accounts={normalizedAccounts} currentAccountId={currentAccountId} />
        </Content>
      </Layout>
    </Layout>
  )
}
