# 架构问题解决方案记录

> 记录日期：2026-09-08
>
> 适用范围：`qianchuan-electron` Electron 客户端。
>
> 目标：在不推倒现有功能、不扩大未确认平台能力的前提下，优先解决已确认的边界问题；监控执行部分只保留当前确实需要的最小保护，避免为了未来场景继续扩张。

## 0. 实施状态（2026-09-08）

- **Slice 1：Application 能力边界：已完成。**
  - 新增 `src/main/application/capabilities/oauth.ts`，以函数记录声明 OAuth 最小能力和稳定错误分类。
  - `AuthService` 已移除对 Infrastructure 具体客户端、HTTP JSON 类型和错误辅助函数的依赖。
  - `oauth-server-client` 现在只在 Infrastructure 边界负责 HTTP、超时、响应归一化和服务端错误映射。
  - `src/main.ts` 继续作为组合根，把 OAuth HTTP 适配器注入 AuthService。
  - OAuth 和 AuthService 测试已分别验证协议映射、错误分类、Token 裁剪、并发恢复和有限刷新。
  - 额外把通用 `JsonRecord` 从 OAuth 客户端中抽离，避免千川 API 客户端反向依赖 OAuth 实现文件。

验证结果：`npm run typecheck`、`npm test`（17 个测试文件、77 个测试）和 `npm run format:check` 均通过；`npm run build` 通过。

- **Slice 2：只读计划列表 Result：已完成。**
  - 新增 `src/shared/contracts/result.ts`，统一 `Result<T>` 判别联合、应用错误码和安全错误转换。
  - 计划列表输入、输出和计划明细字段收紧为 camelCase 白名单，未知字段在 Shared Contract 边界被裁剪。
  - `PromotionPlanService.listResult()` 将旧列表结果适配为稳定 `Result<PromotionPlanListData>`；原 `list()` 暂留给主进程监控内部调用，避免本轮扩大迁移范围。
  - 列表 IPC 已完成输入校验、应用服务调用、输出 Schema 校验和异常安全转换；Preload、Bridge、Renderer API 与页面已同步切换到 `ok/data/error` 结构。
  - 已补齐 Result 契约、Application 适配器和 IPC 边界测试，覆盖未知字段裁剪、输入校验、平台错误分类和非法返回值防泄漏。
  - 计划详情 IPC 已同步迁移到 `Result<PromotionPlanDetailData>`；旧详情结构仅保留在 Application/Infrastructure 内部，Renderer 不再读取可选 `status/message/snapshot` 旧字段。
  - Renderer 的计划列表和详情 Query Key 已集中到纯函数工厂，完整覆盖广告主、筛选条件、日期范围、分页和计划 ID。
  - 普通工作台的默认列表口径已从 `ALL_INCLUDE_DELETED` 调整为 `ALL`；历史/已删除计划不再混入普通工作台，后续单独承载。

验证结果：`npm run typecheck`、`npm test`（18 个测试文件、95 个测试）、`npm run format:check`、`npm run build` 和 `git diff --check` 均通过。

- **Slice 3：监控执行器最小修正：已完成。**
  - 保留按广告主互斥：同一广告主的并发运行返回 `skipped`，不同广告主可以并行读取。
  - `runOnce` 只返回页面当前使用的检查摘要，不增加执行 ID、来源、忙碌数量等暂时没有业务用途的元数据。
  - 暂不引入取消、重试、执行记录、队列或新的调度抽象；等出现明确需求或可验证问题后再单独评估。

验证结果：`npm run typecheck`、`npm test`、`npm run format:check`、`npm run build` 和 `git diff --check` 均通过。

## 1. 总体决策

当前不做一次性大重构，采用“**边界先行、垂直切片、逐步迁移**”的方式：

1. 先固定依赖方向和函数式编程规则；
2. 再固定跨进程 `Result<T>` 和错误分类；
3. 再按业务切片拆分计划查询；
4. 再升级监控调度器；
5. 最后继续接入数据报表、乘方、素材等新业务。

新代码的默认实现范式是函数式编程：纯函数、不可变数据、显式输入输出、函数组合、判别联合和函数记录。网络、文件、Electron、IPC、通知、定时器、当前时间和随机数等副作用必须位于命令式外壳，或者作为显式函数能力注入。

## 2. 目标依赖方向

```text
Renderer
  → Preload / Shared Contracts
  → IPC Handlers
  → Application Use Cases
  → Application Capability Functions
  ← Infrastructure Adapters
```

目标是：

- Application 不 import `src/main/infrastructure/*` 的具体实现或错误辅助函数；
- Infrastructure 只实现 Application 声明的最小能力；
- Renderer 不接触平台字段、平台 URL、OAuth URL、Access Token 和文件格式；
- `src/main.ts` 继续作为唯一组合根，负责创建和连接真实实现。

## 3. 第一阶段：清理 Application → Infrastructure 依赖

### 3.1 新增 OAuth 能力契约

新增：

```text
src/main/application/capabilities/oauth.ts
```

Application 只依赖业务能力，例如：

```ts
export type OAuthCapabilities = {
  startLogin: () => Promise<OAuthLoginStartResult>
  getLoginStatus: (attemptId: string) => Promise<OAuthLoginStatusResult>
  getCurrentAuthorization: (options?: { forceRefresh?: boolean }) => Promise<OAuthAuthorizationResult>
  getHealth: () => Promise<OAuthHealthResult>
}
```

这里不暴露：

- 原始 `JsonRecord`；
- HTTP Response；
- URL 拼接方式；
- OAuth 服务端错误对象；
- Refresh Token；
- 服务端请求头。

`src/main/infrastructure/oauth-server-client.ts` 负责实现这个能力，并在基础设施边界完成 HTTP 响应解析和错误映射。

### 3.2 调整 AuthService

调整：

```text
src/main/application/auth-service.ts
```

使其只依赖：

- `OAuthCapabilities`；
- `openExternal`；
- `now`。

AuthService 仍然负责：

- 登录尝试状态；
- Access Token 内存缓存；
- 授权恢复并发合并；
- Token 裁剪；
- Token 失效后的有限刷新。

但不再负责理解 OAuth HTTP 客户端的实现细节。

### 3.3 计划服务错误依赖清理

`PromotionPlanService` 不再直接使用 Infrastructure 的错误详情函数。平台适配器只向应用层提供：

```ts
isAccessTokenInvalid(error: unknown): boolean
```

更长期的方向是由 Infrastructure 把平台异常映射成应用层错误分类，Application 只处理稳定的业务错误类型。

## 4. 第二阶段：稳定 IPC 业务契约

### 4.1 新增统一 Result 模型

新增：

```text
src/shared/contracts/result.ts
```

目标模型：

```ts
type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: ApplicationErrorCode
        message: string
        retryable: boolean
      }
    }
```

建议的错误码最小集合：

```text
UNAUTHORIZED
FORBIDDEN_ADVERTISER
PLATFORM_RATE_LIMITED
PLATFORM_UNAVAILABLE
PLATFORM_BUSINESS_ERROR
VALIDATION_FAILED
CONFLICT
LOCAL_STORAGE_FAILED
INTERNAL_ERROR
```

### 4.2 采用渐进式迁移

不一次性改掉所有 `ok/status/message` 返回值，迁移顺序为：

1. 新增 `Result<T>` Schema 和类型；
2. 先迁移一个只读计划查询接口；
3. 再迁移计划详情；
4. 再迁移监控任务；
5. 最后迁移写入接口。

迁移期间可以在 Application 层做旧结果到新结果的适配，但不允许 Renderer 自己猜测平台错误。

### 4.3 收紧未知字段

跨进程协议不再使用无边界的 `.passthrough()` 作为默认行为：

- IPC 输入使用 `.strip()`；
- IPC 输出使用明确白名单；
- 外部平台响应先在 Infrastructure 中解析和归一化；
- 只有确实需要向 UI 展示的字段才进入 Shared Contract。

Preload 和 Renderer API 最终应从 `Promise<unknown>` 迁移到明确的业务结果类型；运行时校验仍保留在 Renderer API 边界。

## 5. 第三阶段：拆分计划查询语义

### 5.1 Application 用例拆分

不继续扩大一个固定的 `PromotionPlanService` 或 `useWorkspacePlans`，而是按业务语义拆分：

```text
listPromotionPlans
getPromotionPlanDetail
getPromotionPlanMetrics
findPlansForMonitor
```

每个用例都拥有自己的：

- Application Input；
- Application Output；
- Query Normalizer；
- 平台适配器调用方式；
- 测试夹具。

### 5.2 查询默认值归属

默认值放在 Application 层，不放在页面：

- 普通计划列表默认不包含已删除计划；
- 历史/已删除计划使用独立查询语义；
- 分页由主进程应用层统一处理；
- 监控读取可以使用不同于普通工作台的查询口径；
- 页面只提交业务筛选条件，不拼接平台分页字段。

### 5.3 Query Key 规则

### 5.4 本轮实施进展

- `findPlansForMonitor` 使用独立输入，只接收广告主和场景。
- 监控候选计划的 `status`、日期范围和分页默认值统一由 Application 决定。
- 新增 `plans:find-for-monitor` IPC，并保持输入/输出 Zod 校验和白名单裁剪。
- Renderer 的普通工作台和监控创建页查询均由纯函数构造，页面不再重复拼接查询口径。
- 普通列表与监控候选列表使用不同 Query Key，避免缓存语义混用。

TanStack Query Key 必须包含所有影响结果的业务条件：

```text
业务名称
广告主
场景
日期范围
状态
关键词
页码
页大小
```

广告主切换、重新授权和退出登录时，统一清理相关 Query Cache，避免旧广告主数据短暂显示在新账号下。

## 6. 第四阶段：升级监控执行模型

### 6.1 当前实现

监控目前由一个本地调度器完成：

- 定时器触发 `runOnce`；
- `runOnce` 按广告主分组读取计划；
- 同一广告主已有检查时直接返回 `skipped`；
- 计算规则并把最后一次结果写回任务。

这已经覆盖当前页面需要的行为。暂不拆出 Coordinator、RateLimiter、ExecutionStore 等新模块。

### 6.2 后续触发条件

只有出现以下明确问题时，才考虑增加新的抽象：

- 用户需要取消正在进行的检查；
- 平台明确要求客户端重试或限流；
- 用户需要查询历史执行记录；
- 现有调度器出现难以测试或难以维护的真实重复代码。

### 6.3 拆分 MonitorTask 模型

任务身份只保留：

```text
advertiserId
promotionPlanId
rule
status
intervalMinutes
action
```

展示字段单独作为可刷新快照：

```text
promotionPlanName
productName
productImage
platformStatus
capturedAt
```

执行逻辑不得依赖过期的展示快照。

## 7. 第五阶段：安全边界补齐

### 7.1 IPC sender 校验

主进程 IPC Handler 需要确认调用方来自受信任的主窗口，避免未来增加窗口或外部页面后出现任意 Renderer 调用业务 IPC 的风险。

校验逻辑应当是纯判断函数，Electron 的 `event.sender` 获取和窗口注册放在边界适配器中。

### 7.2 OAuth 客户端身份暂缓

OAuth 服务端的用户、设备、安装实例和授权尝试隔离，需要等待配套 OAuth 服务端新契约稳定后再一起设计。

Electron 侧当前只维持：

- Refresh Token 由服务端保存；
- Access Token 只在 Main 内存中；
- 应用启动时通过 `/oauth/current` 恢复；
- 不在 Electron 侧增加临时客户端 ID 或配对协议。

## 8. 错误处理目标

错误处理分成三层：

```text
Infrastructure Error
  平台 HTTP、网络、JSON、文件系统细节

Application Error
  授权失效、广告主无权限、冲突、限流、可重试性

IPC Result
  用户可理解的 message、稳定 code、retryable
```

业务代码不要根据错误文案做流程判断。判断依据必须是稳定的错误类型或错误码。

日志只保留非敏感上下文：

```text
operation
requestId
advertiserId（必要时脱敏）
elapsedMs
errorCode
```

不得记录：

```text
Access Token
Refresh Token
Cookie
完整请求头
完整平台请求体
平台原始敏感响应
```

## 9. 实施顺序和验收标准

### Slice 1：Application 能力边界

验收：

- `auth-service.ts` 不再 import Infrastructure；
- OAuth HTTP Client 仍由 `src/main.ts` 组装；
- AuthService 单测只传入函数能力，不 Mock HTTP；
- Access Token 行为不改变。

### Slice 2：只读计划列表 Result（已完成）

验收结果：

- ✅ 新增统一 Result Schema；
- ✅ 计划列表输入输出字段明确；
- ✅ Renderer 不再依赖平台原始字段；
- ✅ 平台错误可映射为稳定错误码；
- ✅ 已补齐契约、Application、IPC 和 Renderer API 边界测试；
- ℹ️ 旧 `list()` 仅作为主进程监控内部兼容路径保留，后续详情和监控迁移完成后再评估移除。

Slice 3 已开始：已完成 Query Key 的纯函数集中化、缓存隔离测试，并将普通工作台默认口径收敛为 `ALL`。本轮继续新增独立的 `findPlansForMonitor` 应用用例、IPC channel 和 Renderer 查询构造函数；监控创建页不再拼接状态、日期和分页参数，普通工作台查询也已提取为纯函数。历史/已删除计划仍保持独立语义待后续接入，避免在未核实平台枚举前扩大接口能力。

### Slice 3：查询语义和 Query Key

当前进度：

- ✅ Query Key 已由 `src/renderer/shared/query-keys.ts` 统一生成；
- ✅ 列表 Key 覆盖广告主、关键词、状态、场景、日期范围和分页；
- ✅ 详情 Key 覆盖广告主和计划 ID；
- ✅ 普通工作台不再默认请求 `ALL_INCLUDE_DELETED`。

验收：

- 普通列表、历史列表、监控列表有不同用例；
- Query Key 覆盖完整筛选条件；
- 广告主切换不会复用旧账号缓存；
- 分页由主进程处理。

### Slice 4：监控执行器

验收：

- 手动运行和定时运行都能复用同一个 `runOnce`；
- 支持按广告主互斥；
- 结果只包含页面当前需要的检查摘要；
- 规则计算仍然是纯函数。

### Slice 5：写入接口和安全补强

验收：

- 写入继续遵守“重读、校验、白名单、确认、写后复读”；
- IPC sender 校验完成；
- 预算和 ROI 的部分成功语义保持明确；
- 未确认字段仍然 fail-closed。

## 10. 暂不做的事情

当前明确不做：

- 立即把 JSON 替换成 SQLite；
- 引入完整事件总线；
- 提前设计多平台统一抽象；
- 把监控迁移到云端；
- 根据千川网页内部接口扩展写入能力；
- 为 OAuth 服务端尚未稳定的身份协议创建 Electron 临时兼容层。
