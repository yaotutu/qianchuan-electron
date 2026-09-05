import { QueryClient } from '@tanstack/react-query'

/**
 * 千川数据由服务端统一管理 Token，客户端只缓存短时间的读取结果。
 * 默认关闭窗口聚焦自动刷新，避免 Electron 切换窗口时触发过多平台请求。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
