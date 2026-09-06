import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createJsonMonitorTaskRepository } from '../json-monitor-task-repository'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('JSON 监控任务 Repository', () => {
  it('在目录不存在时返回空集合，并通过临时文件原子替换保存数据', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'qianchuan-repository-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'nested', 'monitor-tasks.json')
    const repository = createJsonMonitorTaskRepository(filePath)

    await expect(repository.readAll()).resolves.toEqual([])
    await repository.replaceAll([])
    await expect(repository.readAll()).resolves.toEqual([])
    expect(await readFile(filePath, 'utf8')).toContain('"version": 1')
  })

  it('拒绝版本或任务结构不受支持的本地文件', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'qianchuan-repository-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'monitor-tasks.json')
    await writeFile(filePath, JSON.stringify({ version: 99, tasks: [] }), 'utf8')

    await expect(createJsonMonitorTaskRepository(filePath).readAll()).rejects.toThrow('本地监控任务数据格式无效')
  })
})
