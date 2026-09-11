import { safeStorage } from 'electron'
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ProductRefreshTokenStore } from '../application/capabilities/product-session-store'

type ProductRefreshTokenStoreOptions = {
  filePath: string
  storage?: Pick<typeof safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'>
}

/**
 * 使用 Electron safeStorage 保存产品 Refresh Token。
 * 文件本身只包含加密后的字符串，并通过临时文件替换避免进程中断产生半文件。
 */
export const createProductRefreshTokenStore = ({
  filePath,
  storage = safeStorage,
}: ProductRefreshTokenStoreOptions): ProductRefreshTokenStore => {
  const read = () => {
    try {
      const encrypted = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
      if (!storage.isEncryptionAvailable() || typeof encrypted !== 'string') return null
      return storage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      // 会话文件损坏或系统密钥不可用时按未登录处理，避免把损坏数据扩散到业务层。
      return null
    }
  }

  const write = (refreshToken: string) => {
    if (!storage.isEncryptionAvailable()) throw new Error('当前系统不支持安全存储，无法保存登录会话。')
    const encrypted = storage.encryptString(refreshToken).toString('base64')
    const temporaryPath = `${filePath}.${process.pid}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(encrypted), { mode: 0o600 })
    renameSync(temporaryPath, filePath)
  }

  const clear = () => {
    try {
      unlinkSync(path.resolve(filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  return { read, write, clear }
}
