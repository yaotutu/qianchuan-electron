import { Alert, Button, Card, Empty, Grid, Spin, Statistic, Typography } from '@arco-design/web-react'
import type { ReactNode } from 'react'

const { Row, Col } = Grid
const { Text, Title } = Typography

export const WorkspacePageHeader = ({
  title,
  description,
  extra,
}: {
  title: string
  description: string
  extra?: ReactNode
}) => (
  <header className="workspace-page-header">
    <div>
      <Title heading={4}>{title}</Title>
      <Text type="secondary">{description}</Text>
    </div>
    {extra}
  </header>
)

export const SummaryCards = ({
  items,
}: {
  items: Array<{ title: string; value: string | number; suffix?: string }>
}) => (
  <Row gutter={16} className="workspace-summary-grid">
    {items.map((item) => (
      <Col span={6} key={item.title}>
        <Card bordered={false} className="workspace-summary-card">
          <Statistic title={item.title} value={item.value} suffix={item.suffix} />
        </Card>
      </Col>
    ))}
  </Row>
)

export const QueryBoundary = ({
  pending,
  error,
  ok,
  message,
  empty,
  onRetry,
  children,
}: {
  pending: boolean
  error: boolean
  ok?: boolean
  message?: string
  empty: boolean
  onRetry: () => void
  children: ReactNode
}) => {
  if (pending)
    return (
      <div className="workspace-query-state">
        <Spin dot />
        <Text type="secondary">正在读取千川数据…</Text>
      </div>
    )
  if (error || ok === false)
    return (
      <Alert
        type="error"
        content={message || '读取数据失败，请检查授权状态后重试。'}
        action={
          <Button type="text" size="small" onClick={onRetry}>
            重试
          </Button>
        }
      />
    )
  if (empty) return <Empty description="当前账号暂无符合条件的数据" />
  return <>{children}</>
}
