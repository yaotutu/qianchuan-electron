/**
 * 产品会话持久化的最小能力。
 * 只保存加密后的 Refresh Token；产品 Access Token 和巨量 Access Token 永不落盘。
 */
export type ProductRefreshTokenStore = {
  read: () => string | null
  write: (refreshToken: string) => void
  clear: () => void
}
