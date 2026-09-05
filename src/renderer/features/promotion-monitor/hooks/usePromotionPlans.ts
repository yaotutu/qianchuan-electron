import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWorkspaceStore } from '../../../app/store'
import { qianchuanApi } from '../../../shared/api/qianchuan-api'
import type { PromotionPlanFilters } from '../../../shared/model/qianchuan'
import { showErrorFeedback } from '../../../shared/ui/feedback'
import {
  DEFAULT_PROMOTION_MONITOR_URL_STATE,
  PROMOTION_MONITOR_PAGE_SIZE,
  parsePromotionMonitorSearchParams,
  updatePromotionMonitorSearchParams,
  type PromotionMonitorTab,
  type PromotionMonitorUrlState,
} from '../model'

type UsePromotionPlansOptions = {
  currentAccountId: string
  availableAccountIds: string[]
}

/**
 * 推广监控查询状态。
 * 筛选、页签和分页以 Hash URL 为可恢复来源，刷新窗口或复制链接后仍能回到相同视图；
 * Zustand 只保存账号等安全界面偏好，不保存任何授权凭据。
 */
export const usePromotionPlans = ({ currentAccountId, availableAccountIds }: UsePromotionPlansOptions) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentAdvertiserId, setCurrentAdvertiserId, setRunningPlanCount } = useWorkspaceStore()
  const urlState = useMemo(() => parsePromotionMonitorSearchParams(searchParams), [searchParams])
  const urlAccountIsAvailable = availableAccountIds.includes(urlState.accountId)
  const advertiserId = (urlAccountIsAvailable ? urlState.accountId : '') || currentAdvertiserId || currentAccountId

  /** 所有查询条件修改统一走这里，避免各组件分别拼接 URL 导致参数丢失。 */
  const updateUrlState = useCallback(
    (patch: Partial<PromotionMonitorUrlState>) => {
      setSearchParams((current) => updatePromotionMonitorSearchParams(current, patch), {
        replace: true,
      })
    },
    [setSearchParams],
  )

  // URL 中的账号优先用于恢复页面，同时同步回工作台账号选择器。
  useEffect(() => {
    if (advertiserId && currentAdvertiserId !== advertiserId) {
      setCurrentAdvertiserId(advertiserId)
    }
  }, [advertiserId, currentAdvertiserId, setCurrentAdvertiserId])

  // 首次进入或 URL 中账号已失效时，用当前有效账号修正链接，禁止请求未授权账号。
  useEffect(() => {
    if (advertiserId && urlState.accountId !== advertiserId) {
      updateUrlState({ accountId: advertiserId, page: 1 })
    }
  }, [advertiserId, updateUrlState, urlState.accountId])

  const filters = useMemo<PromotionPlanFilters>(
    () => ({
      advertiser_id: advertiserId,
      keyword: urlState.keyword.trim(),
      status: urlState.status,
      scene: urlState.scene,
      start_date: urlState.dates[0] || '',
      end_date: urlState.dates[1] || '',
      page: urlState.page,
      page_size: PROMOTION_MONITOR_PAGE_SIZE,
    }),
    [advertiserId, urlState.dates, urlState.keyword, urlState.page, urlState.scene, urlState.status],
  )

  const query = useQuery({
    queryKey: ['promotion-monitor', 'plans', filters],
    queryFn: () => qianchuanApi.listPromotionPlans(filters),
    enabled: Boolean(advertiserId) && urlState.tab === 'manage',
    placeholderData: keepPreviousData,
  })
  const total = Number(query.data?.page?.total || 0)
  const totalPages = Number(query.data?.page?.totalPages || Math.ceil(total / PROMOTION_MONITOR_PAGE_SIZE))

  useEffect(() => {
    setRunningPlanCount(total)
  }, [setRunningPlanCount, total])

  useEffect(() => {
    if (query.data?.status === 'reauthorization_required') {
      showErrorFeedback('授权已失效，请重新登录后再查看计划。')
    }
  }, [query.data?.status])

  // 服务端总页数变化后自动回到最后一个有效页，避免删除或筛选后停留在空白页。
  useEffect(() => {
    if (query.isSuccess && urlState.page > 1 && urlState.page > Math.max(totalPages, 1)) {
      updateUrlState({ page: Math.max(totalPages, 1) })
    }
  }, [query.isSuccess, totalPages, updateUrlState, urlState.page])

  return {
    query,
    filters,
    advertiserId,
    keyword: urlState.keyword,
    status: urlState.status,
    scene: urlState.scene,
    dates: urlState.dates,
    page: urlState.page,
    tab: urlState.tab,
    total,
    lastUpdatedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : undefined,
    setKeyword: (keyword: string) => updateUrlState({ keyword, page: 1 }),
    setStatus: (status: string) => updateUrlState({ status, page: 1 }),
    setScene: (scene: string) => updateUrlState({ scene, page: 1 }),
    setDates: (dates: string[]) => updateUrlState({ dates, page: 1 }),
    setPage: (page: number) => updateUrlState({ page }),
    setTab: (tab: PromotionMonitorTab) => updateUrlState({ tab }),
    setAdvertiserId: (accountId: string) => {
      setCurrentAdvertiserId(accountId)
      updateUrlState({ accountId, page: 1 })
    },
    runSearch: () => updateUrlState({ page: 1 }),
    resetFilters: () =>
      updateUrlState({
        keyword: DEFAULT_PROMOTION_MONITOR_URL_STATE.keyword,
        status: DEFAULT_PROMOTION_MONITOR_URL_STATE.status,
        scene: DEFAULT_PROMOTION_MONITOR_URL_STATE.scene,
        dates: DEFAULT_PROMOTION_MONITOR_URL_STATE.dates,
        page: DEFAULT_PROMOTION_MONITOR_URL_STATE.page,
      }),
  }
}
