import { ConfigProvider } from '@arco-design/web-react'
import zhCN from '@arco-design/web-react/es/locale/zh-CN'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AuthGate } from './features/auth/AuthGate'
import './styles/tokens.css'
import './styles/global.css'
import '@arco-design/web-react/dist/css/arco.css'

/** 应用入口只负责主题和认证边界，具体业务均位于 features 目录。 */
export const App = () => (
  <ConfigProvider locale={zhCN}>
    <AppErrorBoundary>
      <AuthGate />
    </AppErrorBoundary>
  </ConfigProvider>
)
