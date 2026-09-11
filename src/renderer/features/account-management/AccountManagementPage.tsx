import { Alert, Card, Descriptions, Tag } from '@arco-design/web-react'
import type { AdvertiserAccount, AuthState } from '../../../shared/contracts'
import { WorkspacePageHeader, SummaryCards } from '../workspace-plans/components'

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString('zh-CN') : '未返回')

export const AccountManagementPage = ({
  accounts,
  authState,
}: {
  accounts: AdvertiserAccount[]
  authState: AuthState
}) => {
  // 页面只读取脱敏后的授权摘要；平台 Access Token 始终停留在 Electron 主进程内存。
  const selectedAuthorization =
    authState.oauthAccounts.find((account) => account.authorizationId === authState.selectedAuthorizationId) ?? null
  const platformUserName = selectedAuthorization?.user?.displayName || selectedAuthorization?.user?.email || '千川用户'

  return (
    <div className="workspace-page">
      <WorkspacePageHeader title="账号管理" description="查看当前产品账号、巨量授权与广告主信息。" />
      <SummaryCards
        items={[
          { title: '巨量授权', value: authState.oauthAccounts.length, suffix: '个' },
          { title: '当前授权', value: platformUserName },
          { title: '广告主账号', value: accounts.length, suffix: '个' },
        ]}
      />
      <Card title="授权状态" bordered={false}>
        <Alert type="success" content={`当前授权有效，已接入 ${accounts.length} 个广告主账号。`} />
        <Descriptions
          className="workspace-descriptions"
          column={1}
          data={[
            { label: '产品账号', value: authState.productUser?.email || '未登录' },
            { label: '巨量授权用户', value: platformUserName },
            { label: '授权 ID', value: authState.selectedAuthorizationId || '未选择' },
            { label: '短期授权有效期', value: formatDate(authState.accessTokenExpiresAt) },
            { label: '安全说明', value: 'Access Token 仅保留在 Electron 主进程内存，不在页面展示。' },
          ]}
        />
      </Card>
      <Card title="广告主 / 店铺" bordered={false}>
        <div className="workspace-account-list">
          {accounts.map((account) => (
            <div className="workspace-account-row" key={String(account.advertiserId)}>
              <div>
                <strong>{account.advertiserName || '未命名广告主'}</strong>
                <span>广告主 ID：{account.advertiserId}</span>
              </div>
              <Tag color="arcoblue">{account.shopName || '店铺名称未返回'}</Tag>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
