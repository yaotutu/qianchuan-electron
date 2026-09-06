import { Button, Input, Typography } from '@arco-design/web-react'
import { IconSearch } from '@arco-design/web-react/icon'
import type { AdvertiserAccount } from '../../../../shared/contracts'

const { Text } = Typography

type AccountSelectorProps = {
  accounts: AdvertiserAccount[]
  currentAccountId: string
  selectedAdvertiserIds: string[]
  searchKeyword: string
  onSearchKeywordChange: (keyword: string) => void
  onSelectAccount: (advertiserId: string) => void
  onToggleAdvertiser: (advertiserId: string) => void
  onToggleAll: () => void
  onReauthorize: () => void
  onSubscription: () => void
}

const getAccountName = (account?: AdvertiserAccount) =>
  account?.advertiserName || account?.shopName || `广告主 ${account?.advertiserId || '—'}`

/**
 * 账号选择器只管理展示和交互，不直接参与投放计划查询。
 * 把账号切换从工作台骨架中拆出来，后续增加账号分组、刷新状态或批量操作时，
 * 不会继续让 WorkspaceLayout 变成一个难以维护的巨型组件。
 */
export const AccountSelector = ({
  accounts,
  currentAccountId,
  selectedAdvertiserIds,
  searchKeyword,
  onSearchKeywordChange,
  onSelectAccount,
  onToggleAdvertiser,
  onToggleAll,
  onReauthorize,
  onSubscription,
}: AccountSelectorProps) => {
  const keyword = searchKeyword.trim().toLowerCase()
  const filteredAccounts = accounts.filter((account) =>
    [account.advertiserName, account.shopName, account.advertiserId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  )
  const selectedCount = selectedAdvertiserIds.length
  const allSelected = accounts.length > 0 && selectedCount === accounts.length

  return (
    <>
      <div className="account-panel-header">
        <Typography.Title heading={5}>账号选择</Typography.Title>
        <Button type="text" size="small" onClick={onReauthorize}>
          新账号登录
        </Button>
      </div>
      <Input.Search
        allowClear
        value={searchKeyword}
        onChange={onSearchKeywordChange}
        placeholder="请输入千川/店铺名"
        prefix={<IconSearch />}
      />
      <div className="account-selection-bar">
        <Button type="text" size="small" onClick={onToggleAll}>
          {allSelected ? '取消全选' : '选择全部'}
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
                onClick={() => onSelectAccount(id)}
              >
                <input
                  type="checkbox"
                  checked={selectedAdvertiserIds.includes(id)}
                  onChange={() => onToggleAdvertiser(id)}
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
        <Button type="text" size="small" onClick={onSubscription}>
          订购
        </Button>
      </div>
    </>
  )
}
