import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorkspaceView =
  | 'account-management'
  | 'promotion-management'
  | 'promotion-monitor'
  | 'promotion-data'
  | 'multiplier-management'
  | 'multiplier-monitor'
  | 'multiplier-data'

type WorkspaceState = {
  currentAdvertiserId: string
  selectedAdvertiserIds: string[]
  selectedPlanIds: string[]
  accountSearch: string
  filtersCollapsed: boolean
  autoCleanupEnabled: boolean
  monitorInterval: string
  accountSelectionInitialized: boolean
  runningPlanCount: number
  setCurrentAdvertiserId: (advertiserId: string) => void
  setSelectedAdvertiserIds: (advertiserIds: string[]) => void
  toggleAdvertiser: (advertiserId: string) => void
  setSelectedPlanIds: (planIds: string[]) => void
  togglePlan: (planId: string) => void
  setAccountSearch: (keyword: string) => void
  toggleFiltersCollapsed: () => void
  toggleAutoCleanup: () => void
  setMonitorInterval: (interval: string) => void
  setAccountSelectionInitialized: (initialized: boolean) => void
  setRunningPlanCount: (count: number) => void
}

type PersistedWorkspaceState = Pick<
  WorkspaceState,
  | 'currentAdvertiserId'
  | 'selectedAdvertiserIds'
  | 'accountSearch'
  | 'filtersCollapsed'
  | 'autoCleanupEnabled'
  | 'monitorInterval'
  | 'accountSelectionInitialized'
>

const MONITOR_INTERVALS = new Set(['1', '5', '10'])

/**
 * 持久化前做一次轻量清洗，避免旧版本或手工修改 localStorage 破坏工作台状态。
 * 这里明确只允许保存界面偏好，授权凭据永远由服务端管理，不进入 Zustand。
 */
const sanitizePersistedState = (value: unknown): Partial<PersistedWorkspaceState> => {
  if (!value || typeof value !== 'object') return {}
  const persisted = value as Record<string, unknown>
  const advertiserIds = Array.isArray(persisted.selectedAdvertiserIds)
    ? persisted.selectedAdvertiserIds.filter((id): id is string => typeof id === 'string' && Boolean(id))
    : []
  const monitorInterval =
    typeof persisted.monitorInterval === 'string' && MONITOR_INTERVALS.has(persisted.monitorInterval)
      ? persisted.monitorInterval
      : '1'

  return {
    currentAdvertiserId: typeof persisted.currentAdvertiserId === 'string' ? persisted.currentAdvertiserId : '',
    selectedAdvertiserIds: [...new Set(advertiserIds)],
    accountSearch: typeof persisted.accountSearch === 'string' ? persisted.accountSearch : '',
    filtersCollapsed: persisted.filtersCollapsed === true,
    autoCleanupEnabled: persisted.autoCleanupEnabled === true,
    monitorInterval,
    accountSelectionInitialized: persisted.accountSelectionInitialized === true,
  }
}

/** 只把安全的本地界面偏好写入持久化存储，运行时数据和计划勾选状态不持久化。 */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentAdvertiserId: '',
      selectedAdvertiserIds: [],
      selectedPlanIds: [],
      accountSearch: '',
      filtersCollapsed: false,
      autoCleanupEnabled: false,
      monitorInterval: '1',
      accountSelectionInitialized: false,
      runningPlanCount: 0,
      setCurrentAdvertiserId: (currentAdvertiserId) => set({ currentAdvertiserId }),
      setSelectedAdvertiserIds: (selectedAdvertiserIds) => set({ selectedAdvertiserIds }),
      toggleAdvertiser: (advertiserId) =>
        set((state) => ({
          selectedAdvertiserIds: state.selectedAdvertiserIds.includes(advertiserId)
            ? state.selectedAdvertiserIds.filter((id) => id !== advertiserId)
            : [...state.selectedAdvertiserIds, advertiserId],
        })),
      setSelectedPlanIds: (selectedPlanIds) => set({ selectedPlanIds }),
      togglePlan: (planId) =>
        set((state) => ({
          selectedPlanIds: state.selectedPlanIds.includes(planId)
            ? state.selectedPlanIds.filter((id) => id !== planId)
            : [...state.selectedPlanIds, planId],
        })),
      setAccountSearch: (accountSearch) => set({ accountSearch }),
      toggleFiltersCollapsed: () => set((state) => ({ filtersCollapsed: !state.filtersCollapsed })),
      toggleAutoCleanup: () => set((state) => ({ autoCleanupEnabled: !state.autoCleanupEnabled })),
      setMonitorInterval: (monitorInterval) =>
        set({ monitorInterval: MONITOR_INTERVALS.has(monitorInterval) ? monitorInterval : '1' }),
      setAccountSelectionInitialized: (accountSelectionInitialized) => set({ accountSelectionInitialized }),
      setRunningPlanCount: (runningPlanCount) => set({ runningPlanCount }),
    }),
    {
      name: 'qianchuan-workspace-preferences',
      version: 1,
      partialize: (state) => ({
        currentAdvertiserId: state.currentAdvertiserId,
        selectedAdvertiserIds: state.selectedAdvertiserIds,
        accountSearch: state.accountSearch,
        filtersCollapsed: state.filtersCollapsed,
        autoCleanupEnabled: state.autoCleanupEnabled,
        monitorInterval: state.monitorInterval,
        accountSelectionInitialized: state.accountSelectionInitialized,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePersistedState(persisted),
      }),
    },
  ),
)
