import { useQuery } from '@tanstack/react-query'
import { qianchuanApi } from '../../shared/api/qianchuan-api'

export type WorkspacePlanScene = 'UNI_PROJECT' | 'OVERALL_PROJECT'

/** 按北京时间生成当天口径，确保列表和数据看板展示同一查询区间。 */
const getChinaDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

/**
 * 六个工作台模块只复用已经接入的商品计划列表接口，不引入未经核实的新平台接口。
 * 当前授权实测计划少于 100 条，MVP 一次读取 100 条；响应仍保留 total 便于提示是否存在未加载数据。
 */
export const useWorkspacePlans = (advertiserId: string, scene: WorkspacePlanScene = 'UNI_PROJECT') => {
  const date = getChinaDate()
  return useQuery({
    queryKey: ['workspace-plans', advertiserId, scene, date],
    queryFn: () =>
      qianchuanApi.listPromotionPlans({
        advertiser_id: advertiserId,
        keyword: '',
        status: 'ALL_INCLUDE_DELETED',
        scene,
        start_date: date,
        end_date: date,
        page: 1,
        page_size: 100,
      }),
    enabled: Boolean(advertiserId),
  })
}
