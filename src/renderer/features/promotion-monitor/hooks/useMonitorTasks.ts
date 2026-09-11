import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWorkspaceStore } from '../../../app/store'
import { qianchuanApi } from '../../../shared/api/qianchuan-api'
import type { MonitorTaskFilters } from '../../../../shared/contracts'
import { PROMOTION_MONITOR_PAGE_SIZE } from '../model'

type UseMonitorTasksOptions = {
  currentAccountId: string
  availableAccountIds: string[]
  enabled: boolean
}

const TASK_STATUSES = new Set(['ALL', 'RUNNING', 'PAUSED'])
const TASK_METRICS = new Set(['ALL', 'ROI', 'COST', 'BUDGET'])
const TASK_ACTIONS = new Set(['ALL', 'NOTICE'])

const readEnum = <T extends string>(value: string | null, values: Set<string>, fallback: T) =>
  (value && values.has(value) ? value : fallback) as T

const readPage = (value: string | null) => {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/**
 * 本地监控任务查询状态仍写入 Hash URL，刷新 Electron 窗口后可以恢复筛选条件。
 * 查询本身通过 preload 进入主进程，Renderer 不读取本地文件。
 */
export const useMonitorTasks = ({ currentAccountId, availableAccountIds, enabled }: UseMonitorTasksOptions) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { currentAdvertiserId, setCurrentAdvertiserId, setRunningMonitorCount } = useWorkspaceStore()
  const requestedAccountId = searchParams.get('account')?.trim() || ''
  const advertiserId =
    (availableAccountIds.includes(requestedAccountId) ? requestedAccountId : '') ||
    currentAdvertiserId ||
    currentAccountId
  const keyword = searchParams.get('keyword')?.trim() || ''
  const status = readEnum<MonitorTaskFilters['status']>(searchParams.get('status'), TASK_STATUSES, 'ALL')
  const metric = readEnum<MonitorTaskFilters['metric']>(searchParams.get('metric'), TASK_METRICS, 'ALL')
  const action = readEnum<MonitorTaskFilters['action']>(searchParams.get('action'), TASK_ACTIONS, 'ALL')
  const page = readPage(searchParams.get('page'))

  const patchSearch = useCallback(
    (patch: Record<string, string | number>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          Object.entries(patch).forEach(([key, value]) => {
            const text = String(value)
            const isDefault =
              (key === 'page' && text === '1') ||
              (['status', 'metric', 'action'].includes(key) && text === 'ALL') ||
              (key === 'keyword' && !text)
            if (isDefault) next.delete(key)
            else next.set(key, text)
          })
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (advertiserId && requestedAccountId !== advertiserId) patchSearch({ account: advertiserId, page: 1 })
    if (advertiserId && currentAdvertiserId !== advertiserId) setCurrentAdvertiserId(advertiserId)
  }, [advertiserId, currentAdvertiserId, patchSearch, requestedAccountId, setCurrentAdvertiserId])

  const filters = useMemo<MonitorTaskFilters>(
    () => ({
      advertiserId,
      keyword,
      status,
      metric,
      action,
      page,
      pageSize: PROMOTION_MONITOR_PAGE_SIZE,
    }),
    [action, advertiserId, keyword, metric, page, status],
  )

  const query = useQuery({
    queryKey: ['promotion-monitor', 'tasks', filters],
    queryFn: () => qianchuanApi.listMonitorTasks(filters),
    enabled: Boolean(advertiserId) && enabled,
    placeholderData: keepPreviousData,
  })
  const total = query.data?.ok === true ? query.data.data.page.total : 0
  const totalPages =
    query.data?.ok === true ? query.data.data.page.totalPages : Math.ceil(total / PROMOTION_MONITOR_PAGE_SIZE)
  const runningCountQuery = useQuery({
    queryKey: ['promotion-monitor', 'tasks', 'running-count', advertiserId],
    queryFn: () =>
      qianchuanApi.listMonitorTasks({
        advertiserId,
        keyword: '',
        status: 'RUNNING',
        metric: 'ALL',
        action: 'ALL',
        page: 1,
        pageSize: 1,
      }),
    enabled: Boolean(advertiserId),
  })
  const runningCount = runningCountQuery.data?.ok === true ? runningCountQuery.data.data.page.total : 0

  useEffect(() => {
    const unsubscribe = qianchuanApi.onMonitorTasksChanged(() => {
      void queryClient.invalidateQueries({ queryKey: ['promotion-monitor', 'tasks'] })
    })
    return unsubscribe
  }, [queryClient])

  useEffect(() => setRunningMonitorCount(runningCount), [runningCount, setRunningMonitorCount])
  useEffect(() => {
    if (query.isSuccess && page > Math.max(totalPages, 1)) patchSearch({ page: Math.max(totalPages, 1) })
  }, [page, patchSearch, query.isSuccess, totalPages])

  return {
    query,
    filters,
    advertiserId,
    keyword,
    status,
    metric,
    action,
    page,
    total,
    setAdvertiserId: (accountId: string) => {
      setCurrentAdvertiserId(accountId)
      patchSearch({ account: accountId, page: 1 })
    },
    setKeyword: (value: string) => patchSearch({ keyword: value, page: 1 }),
    setStatus: (value: MonitorTaskFilters['status']) => patchSearch({ status: value, page: 1 }),
    setMetric: (value: MonitorTaskFilters['metric']) => patchSearch({ metric: value, page: 1 }),
    setAction: (value: MonitorTaskFilters['action']) => patchSearch({ action: value, page: 1 }),
    setPage: (value: number) => patchSearch({ page: value }),
    resetFilters: () => patchSearch({ keyword: '', status: 'ALL', metric: 'ALL', action: 'ALL', page: 1 }),
  }
}
