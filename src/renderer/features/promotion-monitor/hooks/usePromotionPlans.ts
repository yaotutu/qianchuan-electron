import { useEffect, useMemo, useState } from 'react'
import { Message } from '@arco-design/web-react'
import { useQuery } from '@tanstack/react-query'
import { useWorkspaceStore } from '../../../app/store'
import { qianchuanApi } from '../../../shared/api/qianchuan-api'
import type { PromotionPlanFilters } from '../../../shared/model/qianchuan'
import { PROMOTION_MONITOR_PAGE_SIZE } from '../model'

/**
 * 推广监控查询状态。
 * 页面组件只负责组合布局，这里集中维护筛选条件、分页和 Query 生命周期，
 * 后续接入 URL 参数或服务端预取时也只需要替换这一层。
 */
export const usePromotionPlans = ({ currentAccountId }: { currentAccountId: string }) => {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('ALL')
  const [scene, setScene] = useState('UNI_PROJECT')
  const [dates, setDates] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const { currentAdvertiserId, setCurrentAdvertiserId, setRunningPlanCount } = useWorkspaceStore()
  const advertiserId = currentAdvertiserId || currentAccountId

  const filters = useMemo<PromotionPlanFilters>(
    () => ({
      advertiser_id: advertiserId,
      keyword: keyword.trim(),
      status,
      scene,
      start_date: dates[0] || '',
      end_date: dates[1] || '',
      page,
      page_size: PROMOTION_MONITOR_PAGE_SIZE,
    }),
    [advertiserId, dates, keyword, page, scene, status],
  )

  const query = useQuery({
    queryKey: ['promotion-monitor', 'plans', filters],
    queryFn: () => qianchuanApi.listPromotionPlans(filters),
    enabled: Boolean(advertiserId),
  })
  const total = Number(query.data?.page?.total || 0)

  useEffect(() => {
    setRunningPlanCount(total)
  }, [setRunningPlanCount, total])

  useEffect(() => {
    if (query.data?.status === 'reauthorization_required') {
      Message.error('授权已失效，请重新登录后再查看计划。')
    }
  }, [query.data?.status])

  return {
    query,
    filters,
    advertiserId,
    keyword,
    status,
    scene,
    dates,
    page,
    total,
    setKeyword,
    setStatus: (value: string) => {
      setStatus(value)
      setPage(1)
    },
    setScene: (value: string) => {
      setScene(value)
      setPage(1)
    },
    setDates: (value: string[]) => {
      setDates(value)
      setPage(1)
    },
    setPage,
    setAdvertiserId: (value: string) => {
      setCurrentAdvertiserId(value)
      setPage(1)
    },
    runSearch: () => setPage(1),
    resetFilters: () => {
      setKeyword('')
      setStatus('ALL')
      setScene('UNI_PROJECT')
      setDates([])
      setPage(1)
    },
  }
}
