import { useEffect, useState } from 'react'
import { Spin } from '@arco-design/web-react'
import { useQuery } from '@tanstack/react-query'
import type { ProductCredentials, ProductRegisterInput } from '../../../shared/contracts'
import { qianchuanApi } from '../../shared/api/qianchuan-api'
import { LoginPage } from './LoginPage'
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout'

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000

/** 当前登录生命周期：服务就绪 → 恢复产品会话 → 选择巨量授权 → 进入工作台。 */
export const AuthGate = () => {
  const [loginStartedAt, setLoginStartedAt] = useState<number | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const healthQuery = useQuery({ queryKey: ['auth', 'health'], queryFn: qianchuanApi.getHealth, retry: false })
  const authStateQuery = useQuery({
    queryKey: ['auth', 'state'],
    queryFn: qianchuanApi.restoreSession,
    enabled: healthQuery.data?.ok === true,
    retry: false,
  })
  const statusQuery = useQuery({
    queryKey: ['auth', 'oceanengine-status', loginStartedAt],
    queryFn: qianchuanApi.getLoginStatus,
    enabled: loginStartedAt !== null,
    refetchInterval: (query) =>
      ['success', 'failed', 'expired'].includes(query.state.data?.status ?? '') ? false : 2_000,
    retry: false,
  })

  useEffect(() => {
    if (statusQuery.error) {
      setLoginStartedAt(null)
      setActionError(statusQuery.error instanceof Error ? statusQuery.error.message : '读取授权结果失败，请重新发起。')
      return
    }

    const status = statusQuery.data?.status
    if (status === 'success') {
      setLoginStartedAt(null)
      setActionError('')
      void authStateQuery.refetch()
    } else if (status && ['failed', 'expired'].includes(status)) {
      setLoginStartedAt(null)
      setActionError(statusQuery.data?.message || '本次巨量授权没有完成。')
    }
  }, [authStateQuery.refetch, statusQuery.data, statusQuery.error])

  useEffect(() => {
    if (!loginStartedAt) return undefined
    const timeout = window.setTimeout(() => {
      setLoginStartedAt(null)
      setActionError('本次授权已超过十分钟，请重新发起。')
    }, LOGIN_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [loginStartedAt])

  const runAction = async (action: () => Promise<unknown>, refreshState = true) => {
    setActionBusy(true)
    setActionError('')
    try {
      await action()
      if (refreshState) await authStateQuery.refetch()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败，请稍后重试。')
    } finally {
      setActionBusy(false)
    }
  }

  const handleLogin = (input: ProductCredentials) => runAction(() => qianchuanApi.login(input))
  const handleRegister = (input: ProductRegisterInput) => runAction(() => qianchuanApi.register(input))
  const handleSelectAuthorization = (authorizationId: string) =>
    runAction(() => qianchuanApi.selectAuthorization(authorizationId))
  const handleLogout = () => runAction(qianchuanApi.logout)
  const handleStartOAuth = async () => {
    await runAction(async () => {
      await qianchuanApi.startLogin()
      setLoginStartedAt(Date.now())
    }, false)
  }

  if (healthQuery.isPending || (healthQuery.data?.ok === true && authStateQuery.isPending)) {
    return (
      <div className="app-loading">
        <Spin size={32} />
        <span>正在连接登录服务…</span>
      </div>
    )
  }

  const serviceUnavailable = healthQuery.isError || healthQuery.data?.ok !== true
  const authState = authStateQuery.data
  const canEnterWorkspace = Boolean(
    authState?.productUser && authState.selectedAuthorizationId && authState.selectedAdvertiserIds.length > 0,
  )

  if (canEnterWorkspace && authState) {
    return (
      <WorkspaceLayout
        authState={authState}
        busy={actionBusy}
        onSelectAuthorization={handleSelectAuthorization}
        onReauthorize={handleStartOAuth}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <LoginPage
      healthMessage={
        healthQuery.isError
          ? healthQuery.error instanceof Error
            ? healthQuery.error.message
            : '无法连接登录服务，请稍后重试。'
          : healthQuery.data?.message
      }
      authState={authState}
      busy={actionBusy || (loginStartedAt !== null && statusQuery.isFetching)}
      waiting={loginStartedAt !== null}
      errorMessage={actionError || (authStateQuery.isError ? '恢复登录会话失败，请重新登录。' : undefined)}
      serviceUnavailable={serviceUnavailable}
      onLogin={handleLogin}
      onRegister={handleRegister}
      onStartOAuth={handleStartOAuth}
      onSelectAuthorization={handleSelectAuthorization}
      onLogout={handleLogout}
      onRetry={() => void healthQuery.refetch()}
    />
  )
}
