import { z } from 'zod'

/**
 * 授权相关契约只描述 Electron 各进程都需要识别的安全字段。
 * 服务端即使增加返回字段也不会破坏客户端，同时不会在契约中暴露 Access Token 等敏感信息。
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
    token: z
      .object({
        accessTokenExpiresAt: z.string().optional(),
        advertiserIds: z.array(z.union([z.string(), z.number()]).transform(String)).optional(),
        advertiserAccounts: z.array(advertiserAccountSchema).optional(),
      })
      .passthrough()
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
