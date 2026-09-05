import { contextBridge, ipcRenderer } from 'electron'
import type { PromotionPlanFilters } from './renderer/shared/model/qianchuan'

/**
 * preload 是渲染进程和主进程之间的安全边界。
 * 只暴露按业务划分的最小 API，Renderer 不拿到 ipcRenderer、shell 或 Node.js 能力。
 */
const authBridge = {
  startLogin: () => ipcRenderer.invoke('oauth:start-login'),
  getLoginStatus: () => ipcRenderer.invoke('oauth:get-status'),
  getCurrent: () => ipcRenderer.invoke('oauth:get-current'),
  getHealth: () => ipcRenderer.invoke('oauth:get-health'),
}
const promotionMonitorBridge = {
  listPlans: (filters: PromotionPlanFilters) => ipcRenderer.invoke('plans:list', filters),
}

contextBridge.exposeInMainWorld('qianchuan', {
  auth: authBridge,
  promotionMonitor: promotionMonitorBridge,
  // 旧版页面暂时保留兼容别名，待稳定版本后统一移除。
  oauth: { ...authBridge, getStatus: authBridge.getLoginStatus },
  plans: { list: promotionMonitorBridge.listPlans },
})
