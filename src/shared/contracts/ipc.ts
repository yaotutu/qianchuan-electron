/**
 * IPC channel 是主进程与 preload 的唯一内部协议。
 * 所有新增或修改都必须同步更新主进程 handler、preload 暴露接口和 Renderer 类型。
 */
export const IPC_CHANNELS = {
  auth: {
    startLogin: 'oauth:start-login',
    getStatus: 'oauth:get-status',
    getCurrent: 'oauth:get-current',
    getHealth: 'oauth:get-health',
  },
  promotionPlan: {
    list: 'plans:list',
    findForMonitor: 'plans:find-for-monitor',
    detail: 'plans:detail',
    update: 'plans:update',
  },
  monitorTask: {
    list: 'monitor-tasks:list',
    create: 'monitor-tasks:create',
    update: 'monitor-tasks:update',
    delete: 'monitor-tasks:delete',
    batchStatus: 'monitor-tasks:batch-status',
    batchDelete: 'monitor-tasks:batch-delete',
    runNow: 'monitor-tasks:run-now',
    changed: 'monitor-tasks:changed',
  },
} as const
