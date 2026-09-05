import {
  authorizationSchema,
  healthSchema,
  promotionPlanResultSchema,
  type PromotionPlanFilters,
} from '../model/qianchuan'

/** 获取 preload 暴露的安全桥；Renderer 永远不直接访问 Node.js 或巨量接口。 */
const getBridge = () => {
  if (!window.qianchuan?.auth || !window.qianchuan?.promotionMonitor) {
    throw new Error('客户端安全接口初始化失败，请重启应用。')
  }
  return window.qianchuan
}

export const qianchuanApi = {
  getHealth: async () => healthSchema.parse(await getBridge().auth.getHealth()),
  getCurrentAuthorization: async () =>
    authorizationSchema.parse(await getBridge().auth.getCurrent()),
  startLogin: async () => authorizationSchema.parse(await getBridge().auth.startLogin()),
  getLoginStatus: async () =>
    authorizationSchema.parse(await getBridge().auth.getLoginStatus()),
  listPromotionPlans: async (filters: PromotionPlanFilters) =>
    promotionPlanResultSchema.parse(
      await getBridge().promotionMonitor.listPlans(filters),
    ),
}
