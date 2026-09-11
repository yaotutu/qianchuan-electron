/**
 * IPC channel 是主进程与 preload 的唯一内部协议。
 * 所有新增或修改都必须同步更新主进程 handler、preload 暴露接口和 Renderer 类型。
 */
export const IPC_CHANNELS = {
  auth: {
    getHealth: 'auth:get-health',
    restoreSession: 'auth:restore-session',
    register: 'auth:register',
    login: 'auth:login',
    logout: 'auth:logout',
    getState: 'auth:get-state',
    startLogin: 'auth:start-oceanengine-login',
    getStatus: 'auth:get-oceanengine-status',
    selectAuthorization: 'auth:select-authorization',
    deleteAuthorization: 'auth:delete-authorization',
  },
  promotionPlan: {
    list: 'plans:list',
    findForMonitor: 'plans:find-for-monitor',
    detail: 'plans:detail',
    update: 'plans:update',
  },
  appUpdate: {
    getState: 'app-update:get-state',
    check: 'app-update:check',
    install: 'app-update:install',
    changed: 'app-update:changed',
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
