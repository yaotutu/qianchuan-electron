import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { HashRouter } from 'react-router-dom'
import { queryClient } from './query-client'

/** 统一放置全局 Provider，后续接入国际化、主题或错误监控时无需修改业务组件。 */
export const AppProviders = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>
    <HashRouter>{children}</HashRouter>
  </QueryClientProvider>
)
