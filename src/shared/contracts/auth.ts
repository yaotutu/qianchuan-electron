import { z } from 'zod'

/**
 * 授权相关契约。
 *
 * 服务端 /oauth/current 现在直接返回 Access Token 和 Refresh Token，
 * 供 Electron 主进程直接调用巨量平台 API。
 * Token 只在主进程内存中，不传给 Renderer。
 */
export const advertiserAccountSchema = z
  .object({
    advertiserId: z.union([z.string(), z.number()]).transform(String),
    advertiserName: z.string().optional(),
    shopName: z.string().optional(),
  })
  .passthrough()

export const authorizationSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional().default('error'),
    message: z.string().optional(),
    errorDescription: z.string().optional(),
    user: z
      .object({
        id: z
          .union([z.string(), z.number()])
          .optional()
          .transform((value) => (value === undefined ? undefined : String(value))),
        displayName: z.string().optional(),
        email: z.string().optional(),
        appId: z.union([z.string(), z.number()]).optional(),
        scopeCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
    // Renderer 只允许拿到账户和到期信息；Access Token / Refresh Token
    // 停留在 Electron 主进程内存中，绝不能通过 IPC 返回。
    token: z
      .object({
        accessTokenExpiresAt: z.string().optional(),
        refreshTokenExpiresAt: z.string().optional(),
        advertiserIds: z.array(z.union([z.string(), z.number()]).transform(String)).optional(),
        advertiserAccounts: z.array(advertiserAccountSchema).optional(),
      })
      .optional(),
  })
  .passthrough()

export const healthSchema = z
  .object({
    ok: z.boolean().optional().default(false),
    status: z.string().optional().default('error'),
    message: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough()

export type AdvertiserAccount = z.infer<typeof advertiserAccountSchema>
export type AuthorizationResult = z.infer<typeof authorizationSchema>
export type HealthResult = z.infer<typeof healthSchema>
