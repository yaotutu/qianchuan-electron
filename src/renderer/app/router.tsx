import { Navigate, Route, Routes } from 'react-router-dom'
import type { AdvertiserAccount, AuthState } from '../../shared/contracts'
import { PromotionMonitorPage } from '../features/promotion-monitor/PromotionMonitorPage'
import { AccountManagementPage } from '../features/account-management/AccountManagementPage'
import { PromotionManagementPage } from '../features/promotion-management/PromotionManagementPage'
import { PromotionDataPage } from '../features/promotion-data/PromotionDataPage'
import {
  MultiplierManagementPage,
  MultiplierMonitorPage,
  MultiplierDataPage,
} from '../features/multiplier/MultiplierPages'

type WorkspaceRoutesProps = {
  accounts: AdvertiserAccount[]
  currentAccountId: string
  authState: AuthState
}

/**
 * 工作台业务路由集中管理。
 * HashRouter 适合 Electron file:// 页面，不依赖本地服务器回退配置。
 */
export const WorkspaceRoutes = ({ accounts, currentAccountId, authState }: WorkspaceRoutesProps) => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/promotion-monitor" replace />} />
      <Route
        path="/promotion-monitor"
        element={<PromotionMonitorPage currentAccountId={currentAccountId} accounts={accounts} />}
      />
      <Route path="/account-management" element={<AccountManagementPage accounts={accounts} authState={authState} />} />
      <Route
        path="/promotion-management"
        element={<PromotionManagementPage currentAccountId={currentAccountId} accounts={accounts} />}
      />
      <Route path="/promotion-data" element={<PromotionDataPage currentAccountId={currentAccountId} />} />
      <Route path="/multiplier-management" element={<MultiplierManagementPage currentAccountId={currentAccountId} />} />
      <Route
        path="/multiplier-monitor"
        element={<MultiplierMonitorPage currentAccountId={currentAccountId} accounts={accounts} />}
      />
      <Route path="/multiplier-data" element={<MultiplierDataPage currentAccountId={currentAccountId} />} />
      <Route path="*" element={<Navigate to="/promotion-monitor" replace />} />
    </Routes>
  )
}
