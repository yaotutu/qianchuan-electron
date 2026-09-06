import { useEffect, useMemo, useState } from 'react'
import { Alert, Spin } from '@arco-design/web-react'
import { useQuery } from '@tanstack/react-query'
import { qianchuanApi } from '../../shared/api/qianchuan-api'
import type { AuthorizationResult } from '../../../shared/contracts'
import { LoginPage } from './LoginPage'
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout'

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000

/**
 * 登录生命周期控制器：健康检查 → 恢复持久化授权 → 浏览器 OAuth 轮询 → 进入工作台。
 * 轮询状态只存在于这个功能边界内，后续增加其他登录方式也不会污染工作台组件。
 */
export const AuthGate = () => {
  const [loginStartedAt, setLoginStartedAt] = useState<number | null>(null)
  const [loginError, setLoginError] = useState('')
  const healthQuery = useQuery({
    queryKey: ['auth', 'health'],
    queryFn: qianchuanApi.getHealth,
    retry: false,
  })
  const currentQuery = useQuery({
    queryKey: ['auth', 'current'],
    queryFn: qianchuanApi.getCurrentAuthorization,
    enabled: healthQuery.data?.ok === true,
    retry: false,
  })
  const statusQuery = useQuery({
    queryKey: ['auth', 'login-status', loginStartedAt],
    queryFn: qianchuanApi.getLoginStatus,
    enabled: loginStartedAt !== null,
    refetchInterval: (query) => {
      const result = query.state.data
      if (result?.status && result.status !== 'waiting' && result.status !== 'idle') return false
      return 2_000
    },
    retry: false,
  })

  const refetchCurrentAuthorization = currentQuery.refetch

  useEffect(() => {
    const status = statusQuery.data?.status
    if (status === 'success') {
      setLoginStartedAt(null)
      setLoginError('')
      void refetchCurrentAuthorization()
    } else if (status && !['waiting', 'idle'].includes(status)) {
      setLoginStartedAt(null)
      setLoginError(statusQuery.data?.message || statusQuery.data?.errorDescription || '本次登录没有完成。')
    }
  }, [refetchCurrentAuthorization, statusQuery.data])

  useEffect(() => {
    if (!loginStartedAt) return undefined
    const timeout = window.setTimeout(() => {
      setLoginStartedAt(null)
      setLoginError('本次授权已超过十分钟，请重新发起登录。')
    }, LOGIN_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [loginStartedAt])

  const authorization = useMemo<AuthorizationResult | undefined>(() => {
    if (statusQuery.data?.status === 'success') return statusQuery.data
    return currentQuery.data
  }, [currentQuery.data, statusQuery.data])

  const handleLogin = async () => {
    setLoginError('')
    try {
      const result = await qianchuanApi.startLogin()
      if (!result.ok) {
        setLoginError(result.message || '无法发起登录。')
        return
      }
      setLoginStartedAt(Date.now())
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '无法发起登录。')
    }
  }

  if (healthQuery.isPending || currentQuery.isPending) {
    return (
      <div className="app-loading">
        <Spin size={32} />
        <span>正在连接登录服务…</span>
      </div>
    )
  }

  if (healthQuery.isError) {
    return (
      <LoginPage
        busy={false}
        waiting={false}
        errorMessage="无法连接登录服务，请确认服务端已经启动。"
        onLogin={handleLogin}
        onRetry={() => void healthQuery.refetch()}
      />
    )
  }

  if (authorization?.status === 'success' && authorization.user && authorization.token) {
    return <WorkspaceLayout authorization={authorization} onReauthorize={handleLogin} />
  }

  return (
    <LoginPage
      healthMessage={healthQuery.data?.message}
      authorization={authorization}
      busy={loginStartedAt !== null && statusQuery.isFetching}
      waiting={loginStartedAt !== null}
      errorMessage={
        loginError ||
        (currentQuery.data?.status === 'reauthorization_required'
          ? '长期授权已失效，请重新完成一次巨量授权。'
          : undefined)
      }
      onLogin={handleLogin}
      onRetry={() => void healthQuery.refetch()}
    />
  )
}
