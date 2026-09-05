import { Message } from '@arco-design/web-react'

/**
 * 页面提示统一从这里发出，避免业务组件到处直接依赖组件库的静态 API。
 * 后续如果需要接入埋点、去重或替换通知组件，只修改这一层即可。
 */
export const showInfoFeedback = (message: string) => Message.info(message)
export const showSuccessFeedback = (message: string) => Message.success(message)
export const showErrorFeedback = (message: string) => Message.error(message)
