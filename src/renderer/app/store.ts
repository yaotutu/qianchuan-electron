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
  selectedTaskIds: string[]
  accountSearch: string
  accountSelectionInitialized: boolean
  runningMonitorCount: number
  setCurrentAdvertiserId: (advertiserId: string) => void
  setSelectedAdvertiserIds: (advertiserIds: string[]) => void
  toggleAdvertiser: (advertiserId: string) => void
  setSelectedTaskIds: (taskIds: string[]) => void
  toggleTask: (taskId: string) => void
  setAccountSearch: (keyword: string) => void
  setAccountSelectionInitialized: (initialized: boolean) => void
  setRunningMonitorCount: (count: number) => void
}

type PersistedWorkspaceState = Pick<
  WorkspaceState,
  'currentAdvertiserId' | 'selectedAdvertiserIds' | 'accountSearch' | 'accountSelectionInitialized'
>

/**
 * 持久化前做一次轻量清洗，避免旧版本或手工修改 localStorage 破坏工作台状态。
 * 这里只保存账号选择和界面偏好，授权凭据、任务数据和临时勾选状态都不会进入 Zustand。
 */
const sanitizePersistedState = (value: unknown): Partial<PersistedWorkspaceState> => {
  if (!value || typeof value !== 'object') return {}
  const persisted = value as Record<string, unknown>
  const advertiserIds = Array.isArray(persisted.selectedAdvertiserIds)
    ? persisted.selectedAdvertiserIds.filter((id): id is string => typeof id === 'string' && Boolean(id))
    : []

  return {
    currentAdvertiserId: typeof persisted.currentAdvertiserId === 'string' ? persisted.currentAdvertiserId : '',
    selectedAdvertiserIds: [...new Set(advertiserIds)],
    accountSearch: typeof persisted.accountSearch === 'string' ? persisted.accountSearch : '',
    accountSelectionInitialized: persisted.accountSelectionInitialized === true,
  }
}

/** 任务勾选和运行数量属于当前窗口运行态，关闭应用后无需恢复。 */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentAdvertiserId: '',
      selectedAdvertiserIds: [],
      selectedTaskIds: [],
      accountSearch: '',
      accountSelectionInitialized: false,
      runningMonitorCount: 0,
      setCurrentAdvertiserId: (currentAdvertiserId) => set({ currentAdvertiserId }),
      setSelectedAdvertiserIds: (selectedAdvertiserIds) => set({ selectedAdvertiserIds }),
      toggleAdvertiser: (advertiserId) =>
        set((state) => ({
          selectedAdvertiserIds: state.selectedAdvertiserIds.includes(advertiserId)
            ? state.selectedAdvertiserIds.filter((id) => id !== advertiserId)
            : [...state.selectedAdvertiserIds, advertiserId],
        })),
      setSelectedTaskIds: (selectedTaskIds) => set({ selectedTaskIds }),
      toggleTask: (taskId) =>
        set((state) => ({
          selectedTaskIds: state.selectedTaskIds.includes(taskId)
            ? state.selectedTaskIds.filter((id) => id !== taskId)
            : [...state.selectedTaskIds, taskId],
        })),
      setAccountSearch: (accountSearch) => set({ accountSearch }),
      setAccountSelectionInitialized: (accountSelectionInitialized) => set({ accountSelectionInitialized }),
      setRunningMonitorCount: (runningMonitorCount) => set({ runningMonitorCount }),
    }),
    {
      name: 'qianchuan-workspace-preferences',
      version: 2,
      partialize: (state) => ({
        currentAdvertiserId: state.currentAdvertiserId,
        selectedAdvertiserIds: state.selectedAdvertiserIds,
        accountSearch: state.accountSearch,
        accountSelectionInitialized: state.accountSelectionInitialized,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePersistedState(persisted) }),
    },
  ),
)
