import { Alert, Button, Card, Descriptions, Spin, Tag, Typography } from '@arco-design/web-react'
import { IconCheck, IconLock, IconSafe, IconThunderbolt } from '@arco-design/web-react/icon'
import type { AuthorizationResult } from '../../shared/model/qianchuan'
import { formatDateTime } from '../../shared/utils/format'

const { Title, Text, Paragraph } = Typography

type LoginPageProps = {
  healthMessage?: string
  authorization?: AuthorizationResult
  busy: boolean
  waiting: boolean
  errorMessage?: string
  onLogin: () => void
  onRetry: () => void
}

/** OAuth 页面只呈现状态，不展示 Token 原文；授权详情用于帮助用户确认当前账号。 */
export const LoginPage = ({
  healthMessage,
  authorization,
  busy,
  waiting,
  errorMessage,
  onLogin,
  onRetry,
}: LoginPageProps) => {
  const user = authorization?.user
  const token = authorization?.token
  const hasUser = authorization?.status === 'success' && user
  const isUnavailable = Boolean(errorMessage || authorization?.status === 'server_unavailable')

  return (
    <main className="login-stage">
      <Card className="login-card" bordered={false}>
        <section className="intro-panel">
          <Tag color="arcoblue" bordered={false}>OCEAN ENGINE CONNECT</Tag>
          <Title heading={1}>连接你的<br />巨量千川账户</Title>
          <Paragraph>使用巨量开放平台完成安全授权，统一查看店铺的商品投放计划和经营数据。</Paragraph>
          <ul className="feature-list">
            {[
              ['官方授权', '在巨量官方页面完成授权'],
              ['安全保管', '密钥和 Token 仅由服务端保管'],
              ['自动同步', '登录后自动同步商品投放计划'],
            ].map(([title, description]) => (
              <li key={title}><IconCheck /><span><b>{title}</b>{description}</span></li>
            ))}
          </ul>
        </section>

        <section className="action-panel">
          <div className="panel-heading">
            <div>
              <Text type="secondary">账户连接</Text>
              <Title heading={2}>登录千川</Title>
              <Text type="secondary">使用开放平台授权连接</Text>
            </div>
            <Tag color={hasUser ? 'green' : waiting ? 'orange' : isUnavailable ? 'red' : 'gray'}>
              {hasUser ? '已登录' : waiting ? '等待授权' : isUnavailable ? '暂不可用' : '未登录'}
            </Tag>
          </div>

          {hasUser ? (
            <Card className="user-card" bordered={false}>
              <div className="user-main">
                <div className="avatar">{(user.displayName || '千').slice(0, 1)}</div>
                <div>
                  <Title heading={4}>{user.displayName || '千川用户'}</Title>
                  <Text type="secondary">用户 ID：{user.id || '未返回'}</Text>
                </div>
              </div>
              <Descriptions
                column={1}
                size="small"
                className="user-details"
                data={[
                  { label: '邮箱', value: user.email || '未返回' },
                  { label: '应用 ID', value: String(user.appId || '未返回') },
                  { label: '授权范围', value: `${user.scopeCount || 0} 项` },
                  { label: 'Token 到期', value: formatDateTime(token?.accessTokenExpiresAt) },
                ]}
              />
            </Card>
          ) : (
            <div className={`state-view ${isUnavailable ? 'is-error' : ''}`}>
              <div className="state-icon">
                {busy ? <Spin /> : isUnavailable ? <IconLock /> : waiting ? <IconThunderbolt /> : <IconSafe />}
              </div>
              <Title heading={3}>
                {isUnavailable ? '暂时无法连接登录服务' : waiting ? '请在浏览器中完成授权' : '准备开始'}
              </Title>
              <Paragraph>
                {errorMessage || healthMessage || (waiting
                  ? '授权成功后可以关闭浏览器，本页面会自动更新。'
                  : '点击登录后，将在系统浏览器中打开巨量官方授权页面。')}
              </Paragraph>
              {authorization?.message && <Text type="secondary">{authorization.message}</Text>}
            </div>
          )}

          <Button
            type="primary"
            size="large"
            long
            loading={busy}
            disabled={waiting && busy}
            onClick={isUnavailable ? onRetry : onLogin}
          >
            {isUnavailable ? '重新检测' : hasUser ? '重新授权' : waiting ? '重新打开授权' : '使用巨量千川登录'}
          </Button>
          <div className="privacy-note"><IconLock /> 授权完成后，应用会自动更新登录状态</div>
          {isUnavailable && <Alert className="login-alert" type="warning" content={errorMessage || '请确认登录服务已经启动。'} />}
        </section>
      </Card>
      <Text className="login-footer" type="secondary">电小奇 · 让千川投放管理更简单</Text>
    </main>
  )
}
