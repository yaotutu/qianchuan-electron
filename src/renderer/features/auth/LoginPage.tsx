import { useState } from 'react'
import { Alert, Button, Card, Input, Radio, Select, Spin, Tag, Typography } from '@arco-design/web-react'
import { IconCheck, IconLock, IconSafe, IconThunderbolt } from '@arco-design/web-react/icon'
import type { AuthState, ProductCredentials, ProductRegisterInput } from '../../../shared/contracts'

const { Title, Text, Paragraph } = Typography

type LoginPageProps = {
  healthMessage?: string
  authState?: AuthState
  busy: boolean
  waiting: boolean
  errorMessage?: string
  serviceUnavailable?: boolean
  onLogin: (input: ProductCredentials) => Promise<void>
  onRegister: (input: ProductRegisterInput) => Promise<void>
  onStartOAuth: () => Promise<void>
  onSelectAuthorization: (authorizationId: string) => Promise<void>
  onLogout: () => Promise<void>
  onRetry: () => void
}

/**
 * 登录页只处理产品账号表单和巨量授权选择，不直接接触任何 Token。
 * 当前服务端注册验证码固定为 6666，因此页面明确展示该开发阶段规则，不保留旧登录流程。
 */
export const LoginPage = ({
  healthMessage,
  authState,
  busy,
  waiting,
  errorMessage,
  serviceUnavailable = false,
  onLogin,
  onRegister,
  onStartOAuth,
  onSelectAuthorization,
  onLogout,
  onRetry,
}: LoginPageProps) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('6666')
  const productUser = authState?.productUser
  const activeAccounts = authState?.oauthAccounts.filter((account) => account.status === 'active') ?? []
  const pendingAccounts = authState?.oauthAccounts.filter((account) => account.status === 'pending') ?? []
  const reauthorizationRequiredAccounts =
    authState?.oauthAccounts.filter((account) => account.status === 'reauthorization_required') ?? []

  const submitCredentials = async () => {
    if (mode === 'register') {
      await onRegister({ email: email.trim(), password, verificationCode, deviceName: 'Electron' })
      return
    }
    await onLogin({ email: email.trim(), password, deviceName: 'Electron' })
  }

  return (
    <main className="login-stage">
      <Card className="login-card" bordered={false}>
        <section className="intro-panel">
          <Tag color="arcoblue" bordered={false}>
            DIANXIAOQI CONNECT
          </Tag>
          <Title heading={1}>
            登录电小奇
            <br />
            连接巨量千川
          </Title>
          <Paragraph>先登录产品账号，再绑定并选择属于你的巨量授权，统一管理商品投放计划。</Paragraph>
          <ul className="feature-list">
            {[
              ['会话隔离', '产品账号与巨量平台身份分别管理'],
              ['安全存储', '页面永远拿不到产品或巨量 Token'],
              ['多账号', '支持一个产品用户绑定多个巨量授权'],
            ].map(([title, description]) => (
              <li key={title}>
                <IconCheck />
                <span>
                  <b>{title}</b>
                  {description}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="action-panel">
          <div className="panel-heading">
            <div>
              <Text type="secondary">账户连接</Text>
              <Title heading={2}>{productUser ? '选择巨量授权' : '登录产品账号'}</Title>
              <Text type="secondary">{productUser ? productUser.email : '使用邮箱和密码登录'}</Text>
            </div>
            <Tag color={serviceUnavailable ? 'red' : waiting ? 'orange' : productUser ? 'green' : 'gray'}>
              {serviceUnavailable ? '服务不可用' : waiting ? '等待授权' : productUser ? '产品已登录' : '未登录'}
            </Tag>
          </div>

          {serviceUnavailable ? (
            <div className="state-view is-error">
              <div className="state-icon">
                <IconLock />
              </div>
              <Title heading={3}>暂时无法连接登录服务</Title>
              <Paragraph>{errorMessage || healthMessage || '请稍后重新检测。'}</Paragraph>
              <Button type="primary" long onClick={onRetry}>
                重新检测
              </Button>
            </div>
          ) : !productUser ? (
            <div className="auth-form">
              <Radio.Group type="button" value={mode} onChange={setMode}>
                <Radio value="login">登录</Radio>
                <Radio value="register">注册</Radio>
              </Radio.Group>
              <Input value={email} onChange={setEmail} placeholder="邮箱" allowClear />
              <Input.Password value={password} onChange={setPassword} placeholder="密码（至少 6 位）" />
              {mode === 'register' && (
                <Input value={verificationCode} onChange={setVerificationCode} placeholder="验证码" maxLength={4} />
              )}
              {mode === 'register' && <Text type="secondary">当前测试验证码：6666</Text>}
              <Button type="primary" size="large" long loading={busy} onClick={() => void submitCredentials()}>
                {mode === 'register' ? '注册并登录' : '登录'}
              </Button>
            </div>
          ) : (
            <div className="oauth-account-stage">
              {activeAccounts.length > 0 && (
                <>
                  <Text type="secondary">选择一个可用的巨量授权进入工作台</Text>
                  <Select
                    placeholder="请选择巨量授权"
                    value={authState?.selectedAuthorizationId ?? undefined}
                    onChange={(value) => void onSelectAuthorization(value)}
                    options={activeAccounts.map((account) => ({
                      value: account.authorizationId,
                      label: account.user?.displayName || account.user?.email || account.authorizationId,
                    }))}
                  />
                </>
              )}
              {pendingAccounts.length > 0 && (
                <Alert type="warning" content={`${pendingAccounts.length} 个授权仍在补全平台信息，请稍后重试。`} />
              )}
              {reauthorizationRequiredAccounts.length > 0 && (
                <Alert
                  type="error"
                  content={`${reauthorizationRequiredAccounts.length} 个授权已失效，请重新绑定巨量千川账号。`}
                />
              )}
              <div className="state-view">
                <div className="state-icon">{busy ? <Spin /> : waiting ? <IconThunderbolt /> : <IconSafe />}</div>
                <Title heading={3}>{waiting ? '请在浏览器完成巨量授权' : '绑定新的巨量账号'}</Title>
                <Paragraph>
                  {waiting ? '授权完成后可关闭浏览器，本页面会自动刷新账号列表。' : '授权页面将在系统浏览器中打开。'}
                </Paragraph>
              </div>
              <Button type="primary" size="large" long loading={busy} onClick={() => void onStartOAuth()}>
                {waiting ? '重新打开授权页面' : '绑定巨量千川账号'}
              </Button>
              <Button type="text" long onClick={() => void onLogout()}>
                退出产品账号
              </Button>
            </div>
          )}

          {errorMessage && !serviceUnavailable && <Alert className="login-alert" type="error" content={errorMessage} />}
          <div className="privacy-note">
            <IconLock /> 所有 Token 均不会传递到页面
          </div>
        </section>
      </Card>
      <Text className="login-footer" type="secondary">
        电小奇 · 让千川投放管理更简单
      </Text>
    </main>
  )
}
