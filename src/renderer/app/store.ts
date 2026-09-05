import { create } from 'zustand'

export type WorkspaceView =
  | 'account-management'
  | 'promotion-management'
  | 'promotion-monitor'
  | 'promotion-data'
  | 'multiplier-management'
  | 'multiplier-monitor'
  | 'multiplier-data'

/** 只保存本地界面状态；服务端数据全部交给 TanStack Query。 */
type WorkspaceState = {
  currentAdvertiserId: string
  selectedAdvertiserIds: string[]
  selectedPlanIds: string[]
  accountSearch: string
  filtersCollapsed: boolean
  autoCleanupEnabled: boolean
  runningPlanCount: number
  setCurrentAdvertiserId: (advertiserId: string) => void
  setSelectedAdvertiserIds: (advertiserIds: string[]) => void
  toggleAdvertiser: (advertiserId: string) => void
  setSelectedPlanIds: (planIds: string[]) => void
  togglePlan: (planId: string) => void
  setAccountSearch: (keyword: string) => void
  toggleFiltersCollapsed: () => void
  toggleAutoCleanup: () => void
  setRunningPlanCount: (count: number) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  currentAdvertiserId: '',
  selectedAdvertiserIds: [],
  selectedPlanIds: [],
  accountSearch: '',
  filtersCollapsed: false,
  autoCleanupEnabled: false,
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
  toggleFiltersCollapsed: () =>
    set((state) => ({ filtersCollapsed: !state.filtersCollapsed })),
  toggleAutoCleanup: () =>
    set((state) => ({ autoCleanupEnabled: !state.autoCleanupEnabled })),
  setRunningPlanCount: (runningPlanCount) => set({ runningPlanCount }),
}))
