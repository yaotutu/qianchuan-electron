import { Alert, Card, Descriptions, Tag } from '@arco-design/web-react'
import type { AdvertiserAccount, AuthorizationResult } from '../../../shared/contracts'
import { WorkspacePageHeader, SummaryCards } from '../workspace-plans/components'

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString('zh-CN') : '未返回')

export const AccountManagementPage = ({
  accounts,
  authorization,
}: {
  accounts: AdvertiserAccount[]
  authorization: AuthorizationResult
}) => {
  const expiresAt = authorization.token?.accessTokenExpiresAt
  return (
    <div className="workspace-page">
      <WorkspacePageHeader title="账号管理" description="查看当前授权范围内的广告主与店铺信息。" />
      <SummaryCards
        items={[
          { title: '授权账号', value: accounts.length, suffix: '个' },
          { title: '当前用户', value: authorization.user?.displayName || '千川用户' },
        ]}
      />
      <Card title="授权状态" bordered={false}>
        <Alert type="success" content={`当前授权有效，已接入 ${accounts.length} 个广告主账号。`} />
        <Descriptions
          className="workspace-descriptions"
          column={1}
          data={[
            { label: '授权用户', value: authorization.user?.email || authorization.user?.displayName || '未返回' },
            { label: '短期授权有效期', value: formatDate(expiresAt) },
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
