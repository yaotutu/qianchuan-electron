import { Button, Typography } from '@arco-design/web-react'

const { Title, Text } = Typography

export const featureDefinitions: Record<string, [string, string, string]> = {
  'account-management': ['账', '账号管理', '这里将集中管理千川广告主、授权关系和账号状态。'],
  'promotion-management': ['投', '推广管理', '这里将承载全域推广计划的创建、编辑、复制和批量操作。'],
  'promotion-data': ['数', '推广数据', '这里将展示投放消耗、成交、ROI 和商品维度的数据分析。'],
  'multiplier-management': ['乘', '乘方管理', '千川乘方计划管理页面已经预留。'],
  'multiplier-monitor': ['监', '乘方监控', '千川乘方监控将沿用当前账号体系和监控工作流。'],
  'multiplier-data': ['析', '乘方数据', '千川乘方的数据看板和报表能力将在后续版本接入。'],
}

/** 统一承载暂未接入的模块，避免每个路由各自复制一份占位布局。 */
export const FeaturePlaceholder = ({ view, onBack }: { view: string; onBack: () => void }) => {
  const [icon, title, description] = featureDefinitions[view] || featureDefinitions['promotion-data']
  return (
    <div className="feature-placeholder">
      <div className="placeholder-icon">{icon}</div>
      <Title heading={2}>{title}</Title>
      <Text type="secondary">{description}</Text>
      <Button type="primary" onClick={onBack}>
        返回推广监控
      </Button>
    </div>
  )
}
