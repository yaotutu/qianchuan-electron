import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createProductRefreshTokenStore } from '../product-refresh-token-store'

const temporaryDirectories: string[] = []
const createTemporaryFilePath = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qianchuan-session-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'product-session.json')
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

describe('产品 Refresh Token 安全存储', () => {
  it('只把加密结果写入磁盘，并可通过 safeStorage 能力恢复', () => {
    const filePath = createTemporaryFilePath()
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
      decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
    }
    const store = createProductRefreshTokenStore({ filePath, storage })

    store.write('fixture-refresh-token')

    expect(readFileSync(filePath, 'utf8')).not.toContain('fixture-refresh-token')
    expect(store.read()).toBe('fixture-refresh-token')
    store.clear()
    expect(store.read()).toBeNull()
  })

  it('系统安全存储不可用时拒绝落盘', () => {
    const filePath = createTemporaryFilePath()
    const store = createProductRefreshTokenStore({
      filePath,
      storage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.from('should-not-run'),
        decryptString: () => 'should-not-run',
      },
    })

    expect(() => store.write('fixture-refresh-token')).toThrow('当前系统不支持安全存储')
    expect(store.read()).toBeNull()
  })
})
