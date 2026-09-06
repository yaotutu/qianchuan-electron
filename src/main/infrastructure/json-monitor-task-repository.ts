import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

import { monitorTaskSchema, type MonitorTask } from '../../shared/contracts/monitor-task'
import type { MonitorTaskRepository } from '../application/ports/monitor-task-repository'

const monitorTaskFileSchema = z.object({
  version: z.literal(1),
  tasks: z.array(monitorTaskSchema),
})

const parseFile = (content: string): MonitorTask[] => {
  try {
    return monitorTaskFileSchema.parse(JSON.parse(content)).tasks
  } catch (error) {
    throw new Error('本地监控任务数据格式无效。', { cause: error })
  }
}

/**
 * JSON Repository 仅负责磁盘格式和原子写入，不包含任务筛选、校验或调度规则。
 * 文件中只保存本产品的监控任务，不保存 Access Token、Secret、Cookie 等平台凭据。
 */
export const createJsonMonitorTaskRepository = (filePath: string): MonitorTaskRepository => ({
  readAll: async () => {
    try {
      return parseFile(await readFile(filePath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  },
  replaceAll: async (tasks) => {
    await mkdir(path.dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, filePath)
    } finally {
      // rename 成功后临时路径已不存在；force=true 可同时覆盖成功与失败两种清理路径。
      await rm(temporaryPath, { force: true })
    }
  },
})
