import { Notification } from 'electron'

import type { MonitorTask, MonitorTaskCheckResult } from '../../shared/contracts/monitor-task'

/** 系统通知适配器只处理展示，不包含调度或平台请求逻辑。 */
export const notifyMonitorTask = (task: Pick<MonitorTask, 'promotionPlanName'>, result: MonitorTaskCheckResult) => {
  if (!Notification.isSupported()) return
  new Notification({
    title: `推广监控触发：${task.promotionPlanName}`,
    body: result.message,
  }).show()
}
