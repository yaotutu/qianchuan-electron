import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import type { AdvertiserAccount } from '../shared/model/qianchuan'
import { FeaturePlaceholder } from '../features/placeholder/FeaturePlaceholder'
import { PromotionMonitorPage } from '../features/promotion-monitor/PromotionMonitorPage'

type WorkspaceRoutesProps = {
  accounts: AdvertiserAccount[]
  currentAccountId: string
}

/**
 * 工作台业务路由集中管理。
 * HashRouter 适合 Electron file:// 页面，不依赖本地服务器回退配置。
 */
export const WorkspaceRoutes = ({ accounts, currentAccountId }: WorkspaceRoutesProps) => {
  const navigate = useNavigate()
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/promotion-monitor" replace />} />
      <Route
        path="/promotion-monitor"
        element={<PromotionMonitorPage currentAccountId={currentAccountId} accounts={accounts} />}
      />
      {Object.keys({
        'account-management': true,
        'promotion-management': true,
        'promotion-data': true,
        'multiplier-management': true,
        'multiplier-monitor': true,
        'multiplier-data': true,
      }).map((view) => (
        <Route
          key={view}
          path={`/${view}`}
          element={<FeaturePlaceholder view={view} onBack={() => navigate('/promotion-monitor')} />}
        />
      ))}
      <Route path="*" element={<Navigate to="/promotion-monitor" replace />} />
    </Routes>
  )
}
