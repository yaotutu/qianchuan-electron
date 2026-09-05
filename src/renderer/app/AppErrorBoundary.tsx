import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, Button, Typography } from '@arco-design/web-react'

const { Title, Text } = Typography

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  hasError: boolean
  errorMessage: string
}

/**
 * 统一兜住 Renderer 未预期异常，避免某个功能组件崩溃后整个 Electron 窗口变成白屏。
 * 这里不展示错误堆栈，避免把本地路径、请求参数或平台返回内容暴露给普通用户。
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, errorMessage: '' }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : '发生了未知的页面错误。',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 保留开发期诊断能力，但不会把堆栈渲染到用户界面中。
    console.error('[RendererErrorBoundary]', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="app-error-boundary">
        <div className="app-error-card">
          <div className="placeholder-icon">!</div>
          <Title heading={4}>页面暂时无法显示</Title>
          <Text type="secondary">{this.state.errorMessage || '应用遇到了未预期的问题，请刷新后重试。'}</Text>
          <Alert type="warning" content="如果问题持续出现，请记录操作步骤后联系技术支持。" />
          <Button type="primary" onClick={this.handleReload}>
            刷新页面
          </Button>
        </div>
      </main>
    )
  }
}
