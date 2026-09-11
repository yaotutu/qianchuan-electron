import { z } from 'zod'

import { resultSchema, type Result } from './result'

/** Renderer 可见的产品用户信息，不包含产品 Token。 */
export const productUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: z.string(),
})

export const advertiserAccountSchema = z.object({
  advertiserId: z.string(),
  advertiserName: z.string().optional(),
  shopName: z.string().optional(),
})

export const oauthUserSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  appId: z.string().optional(),
  materialAuthStatus: z.string().optional(),
  scopeCount: z.number().optional(),
  apiCount: z.number().optional(),
})

export const oauthAuthorizationSummarySchema = z.object({
  authorizationId: z.string(),
  status: z.enum(['pending', 'active', 'reauthorization_required']),
  advertiserSyncStatus: z.enum(['pending', 'success']),
  receivedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  user: oauthUserSchema.nullable(),
  advertiserIds: z.array(z.string()),
  advertiserAccounts: z.array(advertiserAccountSchema),
})

export const authStateSchema = z.object({
  productUser: productUserSchema.nullable(),
  oauthAccounts: z.array(oauthAuthorizationSummarySchema),
  selectedAuthorizationId: z.string().nullable(),
  selectedAdvertiserIds: z.array(z.string()),
  accessTokenExpiresAt: z.string().optional(),
})

export const healthDataSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  version: z.string().optional(),
  configured: z.boolean().optional(),
  databaseConnected: z.boolean().optional(),
})

export const authorizationIdSchema = z.string().trim().min(1)

export const productCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  deviceName: z.string().optional(),
})

export const productRegisterInputSchema = productCredentialsSchema.extend({
  verificationCode: z.string().length(4),
})

export const authActionDataSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  retryAfterSeconds: z.number().optional(),
})

export const oauthLoginStatusDataSchema = z.object({
  status: z.string().optional(),
  attemptId: z.string().optional(),
  message: z.string().optional(),
  authorization: oauthAuthorizationSummarySchema.optional(),
})

export type ProductUser = z.infer<typeof productUserSchema>
export type AdvertiserAccount = z.infer<typeof advertiserAccountSchema>
export type OAuthUser = z.infer<typeof oauthUserSchema>
export type OAuthAuthorizationSummary = z.infer<typeof oauthAuthorizationSummarySchema>
/** 所有跨 IPC 的认证查询和命令统一使用 Result<T>；OAuth 服务端内部 DTO 不属于这里。 */
export const healthResultSchema = resultSchema(healthDataSchema)
export const authStateResultSchema = resultSchema(authStateSchema)
export const authActionResultSchema = resultSchema(authActionDataSchema)
export const oauthLoginStatusResultSchema = resultSchema(oauthLoginStatusDataSchema)

export type AuthState = z.infer<typeof authStateSchema>
export type AuthStateResult = Result<AuthState>
export type HealthData = z.infer<typeof healthDataSchema>
export type HealthResult = Result<HealthData>
export type ProductCredentials = z.infer<typeof productCredentialsSchema>
export type ProductRegisterInput = z.infer<typeof productRegisterInputSchema>
export type AuthActionData = z.infer<typeof authActionDataSchema>
export type AuthActionResult = Result<AuthActionData>
export type OAuthLoginStatusData = z.infer<typeof oauthLoginStatusDataSchema>
export type OAuthLoginStatusResult = Result<OAuthLoginStatusData>
