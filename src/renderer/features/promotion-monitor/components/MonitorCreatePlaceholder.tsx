import { Button, Typography } from '@arco-design/web-react'

const { Title, Text } = Typography

/** 创建监控规则的功能边界已经独立，后续可直接替换成分步表单。 */
export const MonitorCreatePlaceholder = ({ onBack }: { onBack: () => void }) => (
  <div className="feature-placeholder">
    <div className="placeholder-icon">＋</div>
    <Title heading={2}>推广监控创建</Title>
    <Text type="secondary">页面结构已经预留。下一阶段接入监控规则、执行动作和计划创建接口。</Text>
    <Button onClick={onBack}>返回监控管理</Button>
  </div>
)
