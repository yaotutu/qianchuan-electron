import { Message } from '@arco-design/web-react'

/**
 * 页面提示统一从这里发出，避免业务组件到处直接依赖组件库的静态 API。
 * 后续如果需要接入埋点、去重或替换通知组件，只修改这一层即可。
 */
export const showInfoFeedback = (message: string) => Message.info(message)
export const showSuccessFeedback = (message: string) => Message.success(message)
export const showErrorFeedback = (message: string) => Message.error(message)

/** 当前阶段所有真实写操作统一使用同一条只读提示，避免不同页面文案不一致。 */
export const showReadOnlyActionFeedback = () =>
  showInfoFeedback('当前仅接入推广监控读取，写操作将在对应平台接口接入后开放。')
