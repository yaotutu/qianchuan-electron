import { useQuery } from '@tanstack/react-query'
import { Alert, Descriptions, Divider, Drawer, Empty, Spin, Tag, Typography } from '@arco-design/web-react'
import { qianchuanApi } from '../../../shared/api/qianchuan-api'
import type { PromotionPlanDetailSnapshot } from '../../../../shared/contracts'
import { PromotionPlanEditPreview } from './PromotionPlanEditPreview'

const { Paragraph, Text, Title } = Typography

type PromotionPlanDetailDrawerProps = {
  advertiserId: string
  adId?: string
  visible: boolean
  onClose: () => void
}

const formatNumber = (value: number | undefined, suffix = '') =>
  value === undefined ? '未返回' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`

const formatBoolean = (value: boolean | undefined) => (value === undefined ? '未返回' : value ? '已开启' : '未开启')

const formatText = (value: string | undefined) => value || '未返回'

const formatList = (values: string[]) => values.join('、') || '未返回'

const statusColor = (status: string | undefined) => {
  if (status === 'DELIVERY_OK') return 'green'
  if (status === 'DELETED') return 'gray'
  return 'arcoblue'
}

/**
 * 推广计划详情只做只读展示。查询由 TanStack Query 管理，关闭抽屉时不写入全局 Store，
 * 避免把可能过时的配置快照当成监控任务的权威数据。
 */
export const PromotionPlanDetailDrawer = ({ advertiserId, adId, visible, onClose }: PromotionPlanDetailDrawerProps) => {
  const detailQuery = useQuery({
    queryKey: ['promotion-plan-detail', advertiserId, adId],
    queryFn: () => qianchuanApi.getPromotionPlanDetail({ advertiserId, adId: adId || '' }),
    enabled: visible && Boolean(advertiserId && adId),
  })
  const snapshot = detailQuery.data?.snapshot

  return (
    <Drawer title="推广计划详情" visible={visible} width={680} onCancel={onClose} unmountOnExit>
      {detailQuery.isPending && (
        <div className="plan-detail-loading">
          <Spin dot />
          <Text type="secondary">正在读取平台配置快照…</Text>
        </div>
      )}
      {detailQuery.isError && <Alert type="error" content="读取计划详情失败，请检查授权后重试。" />}
      {detailQuery.data?.ok === false && (
        <Alert type="error" content={detailQuery.data.message || '读取计划详情失败。'} />
      )}
      {snapshot && <PlanDetailContent snapshot={snapshot} />}
      {!detailQuery.isPending && !detailQuery.isError && !snapshot && <Empty description="暂未获取到计划详情" />}
    </Drawer>
  )
}

const PlanDetailContent = ({ snapshot }: { snapshot: PromotionPlanDetailSnapshot }) => {
  const { identity, delivery, creative, advanced, capabilities } = snapshot
  return (
    <div className="plan-detail-content">
      <div className="plan-detail-heading">
        <div>
          <Title heading={4}>{identity.name || '未命名计划'}</Title>
          <Text type="secondary">
            计划 ID：{identity.adId} · 广告主：{identity.advertiserId}
          </Text>
        </div>
        <Tag color={statusColor(identity.status)}>{identity.status || '未知状态'}</Tag>
      </div>

      <Descriptions
        className="plan-detail-status"
        column={1}
        size="small"
        data={[
          { label: '营销目标', value: identity.marketingGoal || '未返回' },
          { label: '计划场景', value: identity.scene || '未返回' },
          { label: '创建时间', value: identity.createTime || '未返回' },
          { label: '平台修改时间', value: identity.modifyTime || '未返回' },
          { label: '快照时间', value: snapshot.fetchedAt },
        ]}
      />

      <Divider>投放配置</Divider>
      <Descriptions
        column={1}
        size="small"
        data={[
          { label: '投放方式', value: delivery.smartBidType || '未返回' },
          { label: '计费方式', value: delivery.pricingType || '未返回' },
          { label: '预算', value: formatNumber(delivery.budgetYuan, ' 元') },
          { label: '支付 ROI 目标', value: formatNumber(delivery.roiGoal) },
          { label: '日投放时长', value: formatNumber(delivery.dailyDeliveryHours, ' 小时') },
          { label: '投放时间', value: [delivery.startTime, delivery.endTime].filter(Boolean).join(' 至 ') || '未返回' },
        ]}
      />

      <Divider>商品、账号与直播间</Divider>
      <Descriptions
        column={1}
        size="small"
        data={[
          { label: '商品数量', value: `${snapshot.products.length} 个` },
          {
            label: '商品 ID',
            value:
              snapshot.products
                .map((product) => product.productId)
                .filter(Boolean)
                .join('、') || '未返回',
          },
          {
            label: '抖音账号',
            value:
              snapshot.accounts
                .map((account) => account.awemeName || account.awemeUid)
                .filter(Boolean)
                .join('、') || '未返回',
          },
          {
            label: '直播间/主播',
            value:
              snapshot.rooms
                .map((room) => room.anchorName || room.anchorId)
                .filter(Boolean)
                .join('、') || '未返回',
          },
        ]}
      />

      <Divider>素材摘要</Divider>
      <Descriptions
        column={1}
        size="small"
        data={[
          { label: '智能优选素材', value: formatBoolean(creative.smartSelectMaterial) },
          { label: '隐藏在抖音', value: formatBoolean(creative.hideInAweme) },
          { label: 'AIGC 创意', value: formatBoolean(creative.enableAigcCreative) },
          { label: '直播间画面', value: formatBoolean(creative.liveRoomViewEnabled) },
          { label: '自选视频', value: formatBoolean(creative.selfSelectedVideoEnabled) },
          { label: '视频 / 图片素材', value: `${creative.videoCount} / ${creative.imageCount}` },
          { label: '标题 / 轮播素材', value: `${creative.titleCount} / ${creative.carouselCount}` },
          { label: '屏蔽素材', value: `${creative.blockedMaterialCount} 个` },
          { label: '星选商品 ID', value: formatList(creative.selectedStarProductIds) },
        ]}
      />

      <Divider>高级设置</Divider>
      <Descriptions
        column={1}
        size="small"
        data={[
          { label: '千川排品模式', value: formatText(advanced.qcpxMode) },
          { label: '星选素材开关', value: formatText(advanced.starTaskMaterialSwitch) },
          { label: '全域 ROI 成本项', value: formatList(advanced.overallRoiCostItems.map(String)) },
          { label: '达人佣金优化', value: formatText(advanced.allianceCommissionSwitch) },
          { label: '多号乘方', value: formatBoolean(advanced.isMultiAwemeUid) },
          { label: '无号投商城', value: formatBoolean(advanced.noAwemeId) },
          { label: '自动拉取账号素材', value: formatBoolean(advanced.autoAwemeMaterial) },
        ]}
      />
      {creative.titles.length > 0 && (
        <Paragraph className="plan-detail-titles">
          <Text type="secondary">标题示例：</Text> {creative.titles.join('、')}
        </Paragraph>
      )}

      <Divider>修改草稿与差异预览</Divider>
      <PromotionPlanEditPreview snapshot={snapshot} />

      <Divider>当前能力评估</Divider>
      <div className="plan-detail-capabilities">
        <Tag color={capabilities.canUpdateBudget ? 'green' : 'gray'}>
          预算：{capabilities.canUpdateBudget ? '平台支持评估' : '不可用'}
        </Tag>
        <Tag color={capabilities.canUpdateRoi ? 'green' : 'gray'}>
          ROI：{capabilities.canUpdateRoi ? '自定义投放可评估' : '需自定义投放'}
        </Tag>
        <Tag color="gray">真实写操作：暂未开放</Tag>
      </div>
      <div className="plan-detail-note">
        <Text type="secondary">{capabilities.reasons.join(' ')}</Text>
      </div>
    </div>
  )
}
