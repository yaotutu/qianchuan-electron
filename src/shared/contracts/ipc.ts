/**
 * IPC channel 是主进程与 preload 的内部协议，统一定义可避免两端字符串逐渐漂移。
 * 字符串值保持历史兼容，重构不会要求 Renderer 和主进程同时切换到新协议。
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
    detail: 'plans:detail',
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
