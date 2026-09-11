import { z } from 'zod'

/**
 * 更新状态只保留 Renderer 真正需要展示和交互的字段，避免把 electron-updater 的
 * UpdateInfo、下载路径或 GitHub 响应直接穿过 IPC 边界。
 */
export const appUpdateStatusSchema = z.enum([
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'up-to-date',
  'error',
])

export const appUpdateStateSchema = z.object({
  status: appUpdateStatusSchema,
  currentVersion: z.string().min(1),
  availableVersion: z.string().min(1).optional(),
  downloadPercent: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
})

export type AppUpdateStatus = z.infer<typeof appUpdateStatusSchema>
export type AppUpdateState = z.infer<typeof appUpdateStateSchema>
