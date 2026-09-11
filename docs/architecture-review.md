# 千川 Electron 架构评审

> 评审日期：2026-09-08
>
> 评审范围：`qianchuan-electron` Electron 客户端，以及配套的 `qianchuan-oauth-callback` OAuth 服务端。
> 本文只记录架构边界、长期演进风险和迁移顺序，不把暂时没有业务需求的能力提前实现。

## 1. 结论先行

当前架构已经具备一个正确的安全方向：

- Renderer 不直接访问巨量平台和文件系统；
- 主进程负责业务编排和直接调用巨量官方 OpenAPI；
- Refresh Token 留在 OAuth 服务端，Access Token 只在 Electron 主进程内存中短期持有；
- 计划写入采用“重读详情、校验快照、白名单生成命令、写后复读”的防并发覆盖流程；
- 监控任务通过显式传入的仓库函数持久化，JSON 文件采用原子替换。

但是，当前代码还没有达到“以后只在上面叠加业务模块”的稳定底座。主要原因不是目录不够多，而是**依赖方向、跨进程契约、OAuth 客户端身份、平台模型边界和监控执行模型**仍然没有完全固定。

建议结论：

1. **先修复 P0 架构问题，再继续扩展新的业务模块。**
2. 不做一次性大重构；先建立明确的能力函数、应用用例模型和 IPC 契约，再逐个迁移现有能力。
3. 计划、数据报表、乘方、监控等后续模块都必须依赖应用层接口，不得直接复用巨量平台字段或基础设施实现。
4. 产品 Access Token 和巨量 Access Token 只放在主进程内存中。应用退出后通过本地 `safeStorage` 加密保存的产品 Refresh Token 调用 `/auth/refresh`，再按 `authorizationId` 获取巨量短期 Token；Access Token 不写入 Electron 磁盘。

## 2. 当前真实架构

```text
┌─────────────────────────────────────────────────────────────┐
│ Renderer                                                     │
│ React / TanStack Query / Zustand                             │
│ 页面、筛选、短生命周期 UI 状态                               │
└──────────────────────────────┬──────────────────────────────┘
                               │ window.qianchuan
┌──────────────────────────────▼──────────────────────────────┐
│ Preload                                                      │
│ contextBridge + ipcRenderer.invoke/on                        │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC_CHANNELS
┌──────────────────────────────▼──────────────────────────────┐
│ Electron Main                                                │
│ IPC Handler → Application Use Case Functions → Infrastructure │
│                                                              │
│ AuthService       PromotionPlanService       MonitorTaskService│
│       │                    │                         │         │
│ OAuth Client        Qianchuan API Client       Task Store     │
│       │                    │                         │         │
│ OAuth Server        OceanEngine OpenAPI        JSON 文件      │
└─────────────────────────────────────────────────────────────┘
```

配套 OAuth 服务端当前为：

```text
HTTP Routes
  → OAuth Service / Token Lifecycle
  → Platform Client
  → 加密 Token Store
```

这个总体分层是对的，但当前部分“应用层”仍然反向依赖 `infrastructure`，所以目录结构比真实依赖关系更干净。

## 3. 已确认的优点

### 3.1 Token 生命周期方向正确

产品 Access Token 和巨量 Access Token 在 Electron 主进程内存中缓存。产品 Refresh Token 通过 Electron `safeStorage` 加密保存，巨量 Refresh Token 仍由 OAuth 服务端加密持久化。应用退出时 Access Token 缓存自然消失，下次启动先恢复产品会话，再获取指定巨量授权的短期 Token。这比把 Access Token 写进本地 JSON、Renderer 状态或 localStorage 更安全，也符合短期凭证的生命周期。

必须继续保持以下规则：

- Renderer 永远不接触 Access Token、Refresh Token、App Secret、Cookie 和授权码；
- 日志、异常、IPC 返回值和测试夹具不得包含 Token 原文；
- 平台 Token 失效只允许有限次数刷新和重试；
- 不能为了“离线恢复”而把 Access Token 落盘。

### 3.2 写操作的安全边界已经有雏形

计划写入不是把 Renderer 的请求直接转发给平台，而是由主进程重新读取详情并根据最新快照生成白名单命令。这是正确的应用服务边界，后续启停、删除、复制等写操作也必须沿用同一模式。

### 3.3 监控任务与平台计划已经开始分离

`PromotionPlan` 和 `MonitorTask` 已经有不同的契约和持久化边界。监控任务是本地业务对象，不应被误认为平台推广计划。这个区分必须在路由、命名和应用服务层继续保持。

### 3.4 本地 JSON 仓库适合当前单机 MVP

监控任务仓库已经通过函数记录抽象，JSON 写入采用临时文件 + `rename`，并在 Store 中串行化读改写。对于当前“单机、单进程、本地监控任务”的范围，暂时不需要为了架构洁癖立即引入数据库。


### 3.5 自动更新边界

当前自动更新采用 `electron-updater`，但仍保持函数式应用边界：

- `src/main/application/update-service.ts` 只负责更新状态转换、自动下载和安装前置判断；
- `src/main/infrastructure/electron-updater.ts` 封装 Electron updater 事件和 GitHub 实现；
- `src/shared/contracts/app-update.ts` 只暴露稳定的状态枚举和进度字段；
- DEV 分支发布为普通 GitHub Release，版本号按工作流编号递增，并上传 `latest*.yml` 与 blockmap 元数据；
- Renderer 不接触 GitHub API、更新实例、下载路径或任何凭据，更新故障只显示为可重试状态。

当前 CI 未配置 macOS/Windows 代码签名，因此 macOS 安装包的自动安装仍受签名配置限制；这不改变更新协议本身，后续配置签名密钥时无需调整 Renderer/IPC 边界。

## 4. P0：现在不修，后续一定会返工

### P0-1（已解决）OAuth 服务端产品用户身份边界

新版服务端已经删除全局当前授权接口。除平台 callback 外，OAuth 尝试、授权列表、指定授权 Token 获取和解绑接口都要求产品用户 Bearer Token，并按产品用户隔离数据。

Electron 当前实现：

- 通过 `/auth/login`、`/auth/register` 和 `/auth/refresh` 管理产品会话；
- 产品 Access Token 只存主进程内存，产品 Refresh Token 通过 `safeStorage` 加密保存；
- `/oauth/result` 只能读取当前产品用户发起的 `attemptId`；
- `/oauth/accounts` 只返回当前产品用户的巨量授权；
- `/oauth/accounts/{authorizationId}/token` 和删除接口同时校验产品用户与授权归属；
- 不保留任何全局最近授权或旧接口兼容层。

### P0-2 Application 层直接依赖 Infrastructure 具体实现

评审时发现的典型依赖包括：

- `auth-service.ts` 直接 import `oauth-server-client` 的 `JsonRecord`、错误解析函数和客户端类型；
- `promotion-plan-service.ts` 直接 import `qianchuan-api-client` 的错误类型和客户端类型；
- `promotion-plan-service.ts` 直接 import `qianchuan-domain.ts` 的平台 URL、查询解析和响应标准化；
- `monitor-task-service.ts` 直接依赖具体的 `MonitorTaskStore` 和 `MonitorScheduler` 类型；
- `MonitorPlanSnapshot` 定义在调度器文件中，却被计划应用服务使用。

截至 2026 年 9 月 8 日，非 OAuth 范围的第一轮迁移已经完成：

- 监控任务应用服务和本地持久化已改为函数能力记录；
- 商品计划新增 `PromotionPlanPlatformCapabilities`，应用服务不再引用千川 HTTP 客户端、平台 URL 或平台响应解析函数；
- `qianchuan-promotion-plan-adapter.ts` 集中负责 OpenAPI URL、查询映射、响应标准化和受控写接口；
- `MonitorPlanSnapshot` 已移动到应用能力模块，调度器不再作为计划领域类型的归属处；
- OAuth 客户端与用户隔离仍按约定暂缓，等待服务端新契约稳定后联动重构。

真实依赖更接近：

```text
Application → Infrastructure
```

函数式目标不是引入一套面向对象的抽象层，而是让应用函数只接收所需能力：

```text
Application → 显式能力函数 / Domain
Infrastructure → 实现能力函数 / Domain
```

否则未来增加报表、商品、素材、多个平台适配器时，应用函数会继续直接认识 HTTP 客户端、平台 URL、调度器实现，最终只能进行大面积底层迁移。

**目标：**

```text
src/main/domain/
  promotion-plan.ts
  monitor-task.ts
  errors.ts

src/main/application/
  auth/
  promotion-plans/
  monitor-tasks/
  capabilities/

src/main/infrastructure/
  oauth/
  qianchuan/
  persistence/
  notifications/
  scheduling/
```

应用层只依赖函数类型和函数记录，例如：

```ts
type AuthorizationSession = {
  getAccessToken: () => string | null
  refreshAccessToken: () => Promise<string | null>
  canAccessAdvertiser: (advertiserId: string) => boolean
}

type PromotionPlanGateway = {
  list: (query: PromotionPlanListQuery) => Promise<PromotionPlanPage>
  getDetail: (input: PromotionPlanDetailQuery) => Promise<PromotionPlanSnapshot>
  update: (command: PromotionPlanUpdateCommand) => Promise<PromotionPlanUpdateResult>
}

type MonitorTaskPersistence = {
  readAll: () => Promise<MonitorTask[]>
  replaceAll: (tasks: MonitorTask[]) => Promise<void>
}
```

平台 URL、HTTP 请求、Token Header、平台原始错误码只能出现在 `infrastructure/qianchuan` 内部。

### P0-3 跨进程契约不是稳定的业务契约

目前 `QianchuanBridge` 大量返回 `Promise<unknown>`，Zod Schema 也大量使用 `.passthrough()` 和宽泛的 `status: string`。这能防止部分运行时崩溃，但没有把 IPC 当成长期版本化的产品协议。

后续新增模块会出现这些问题：

- 主进程返回字段变化，Renderer 只能在运行时才发现；
- 不同模块各自定义 `ok/status/message`，错误状态难以统一；
- 平台新增字段被 `.passthrough()` 带入 Renderer，导致页面逐渐依赖未声明字段；
- IPC channel、Preload 方法、Renderer API 和 Schema 需要手工同步，容易漏改。

**目标：**

- 以业务模块拆分 IPC：`auth.v1`、`promotionPlans.v1`、`monitorTasks.v1`；
- 每个命令都拥有明确的输入和输出类型；
- 返回稳定的判别联合，而不是任意字符串状态；
- 外部数据在主进程边界先标准化，Renderer 只接收 UI 安全 DTO；
- 对未支持字段采用 `.strip()` 或显式白名单，不能把平台返回值当成公共协议。

例如：

```ts
type ApplicationErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN_ADVERTISER'
  | 'PLATFORM_RATE_LIMITED'
  | 'PLATFORM_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'LOCAL_STORAGE_FAILED'

type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: ApplicationErrorCode; message: string; retryable: boolean } }
```

这里的目标不是让 Renderer 知道平台所有错误，而是让它稳定知道“要不要重试、是否需要重新授权、是否需要刷新、是否需要用户确认”。

### P0-4 平台模型、应用模型和页面模型混在一起（已完成第一阶段）

此前 `PromotionPlanFilters` 使用 `advertiser_id`、`start_date`、`page_size` 等平台字段命名，
同时承担 IPC 输入、应用查询和平台请求参数的职责，导致页面被迫了解巨量 OpenAPI 的命名。

2026 年 9 月 8 日已完成第一阶段拆分：

- Renderer/IPC 使用 `PromotionPlanListInput`，统一使用 `advertiserId`、`dateRange.startDate`、`dateRange.endDate`、`pageSize`；
- Application 使用完整的 `PromotionPlanListQuery`，由应用服务负责广告主归属检查、默认值和空字符串归一化；
- Infrastructure 适配器在唯一边界将应用查询映射为平台 `advertiser_id`、`start_date`、`page_size` 等参数；
- 旧的 `PromotionPlanFilters` 和 Renderer snake_case 查询入口已删除，不保留兼容路径。

这会让未来的分页、数据报表、乘方计划和监控查询互相污染。三层模型固定为：

```text
Renderer DTO
  PromotionPlanListInput { advertiserId, scene, dateRange, page }

Application Query
  PromotionPlanListQuery { advertiserId, scene, dateRange, status, pagination: { page, pageSize } }

Platform Request
  ProductPlanListRequest { advertiser_id, start_date, end_date, ... }
```

只允许 Infrastructure 做 Application Query → Platform Request 的映射。平台字段不能反向泄漏到 Renderer。

后续新增计划查询必须复用上述边界，不得在 Renderer 或 IPC 中重新定义平台字段别名。

## 5. 用户确认的暂缓项

### OAuth 授权与用户隔离

这一项暂不作为当前 Electron 重构目标。服务端正在调整授权与用户隔离模型，Electron 侧先保持当前 Token 生命周期和调用方式：

- Refresh Token 继续只由 OAuth 服务端持久化和刷新；
- Access Token 继续只在 Electron 主进程内存中短期持有；
- Electron 重启后继续通过服务端当前授权接口恢复；
- 暂不自行设计客户端 ID、设备 ID、授权租户或远程配对协议。

待 `qianchuan-oauth-callback` 服务端的新接口契约确定后，再同步更新 OAuth Client、AuthService、IPC 契约和相关测试。

## 6. P1：近期应补齐，影响新模块扩展

### P1-1 计划读取需要统一 Query Service，但不能继续复用一个固定 Hook

现在多个页面复用 `useWorkspacePlans`，固定发送：

- 当天日期；
- `status=ALL`（普通工作台已不再混入已删除计划）；
- `page=1`；
- `page_size=100`；
- 一个 `scene`。

这会造成两个实际问题：

1. 普通工作台把已删除历史计划和有效计划混在一起；
2. 页面看起来像“没有完整数据”，但实际只是只读第一页或查询口径不对。

建议：

- 普通计划列表默认使用 `ACTIVE/ALL` 口径，不包含已删除计划；
- 历史/已删除计划单独提供查询入口；
- 在主进程应用层处理分页和平台分页，不让 Renderer 自己猜测总页数；
- 将查询拆为 `listPromotionPlans`、`getPromotionPlanDetail`、`getPromotionPlanMetrics`、`findPlansForMonitor` 等有清晰语义的用例；
- 对同一广告主、同一查询口径做请求去重和节流，避免触发平台频率限制。

### P1-2 监控调度器需要从“定时器函数”升级为“任务执行器”

当前调度器已经按广告主分组并做互斥保护，满足当前“手动检查”和“定时检查”的需要。

此前曾考虑拆出 Coordinator、RateLimiter、ExecutionStore 等模块，但这会把尚未发生的需求提前变成代码。当前明确保持简单：

- 同一广告主的并发运行直接返回 `skipped`；
- 不同广告主可以并行读取；
- 结果只返回页面当前需要的检查摘要；
- 任务继续只保存最后一次检查结果，不新增执行记录。

只有当取消、平台重试/限流、历史执行记录或真实维护困难出现时，才重新评估拆分。

### P1-3 MonitorTask 的本地模型需要去掉平台展示快照的强耦合

当前任务中保存了 `promotionPlanName`、`productName`、`productImage`、`platformStatus` 等展示字段。这对离线展示友好，但这些字段会随平台计划变化而过期。

建议区分：

```text
MonitorTaskTarget {
  advertiserId
  promotionPlanId
}

MonitorTaskDisplaySnapshot {
  promotionPlanName
  productName
  productImage
  capturedAt
}
```

任务真正执行只依赖 Target；展示信息作为可刷新快照，不应该成为任务身份或业务规则的唯一来源。未来计划改名、商品变化、跨账号切换时，底层不需要迁移任务逻辑。

### P1-4 本地持久化接口要补上版本、恢复和迁移策略

监控任务 JSON 当前适合单机 MVP，但后续需要固定：

- 文件损坏时如何备份坏文件并恢复空数据；
- schema version 升级如何迁移；
- `replaceAll` 是否需要 revision/version 防止意外覆盖；
- 多窗口或异常退出时如何保证读写一致；
- 执行记录增长后是否拆成独立文件或 SQLite 表。

现在不必立即改成 SQLite，但仓库能力建议改成面向领域的异步函数，并显式包含 `revision` 或事务语义。不要让业务层知道 JSON 文件格式。这里的边界通过函数类型和函数记录表达，不创建类或继承层次。

### P1-5 Renderer 状态和查询缓存需要明确职责

当前 TanStack Query 缓存服务端/主进程返回的数据，Zustand 持久化工作台选择状态，这是正确方向。但是需要固定规则：

- 计划、账号、监控任务、运行结果全部属于 Query 数据，不复制到 Zustand；
- Zustand 只保存当前广告主、筛选条件、选中 ID 和纯 UI 偏好；
- 授权变化、广告主切换、登出时必须统一清理相关 Query Cache；
- Query key 必须包含广告主、日期范围、场景、状态和分页，不能继续只用 `advertiserId + scene + date`；
- 监控任务变更事件应通过统一 invalidation 机制，而不是页面各自监听后手工刷新。

### P1-6 统一平台错误、网络错误和本地错误

目前平台错误、OAuth 错误、Zod 错误、文件错误在不同层用 `Error.message` 传递。后续模块会重复写错误判断。

建议建立错误层次：

```text
DomainValidationError
AuthorizationRequiredError
AdvertiserAccessDeniedError
PlatformRateLimitError
PlatformBusinessError
PlatformNetworkError
LocalPersistenceError
ConflictError
```

主进程负责记录非敏感诊断上下文，IPC 只返回稳定错误码、用户提示和 retryable 标志。日志应包含 requestId、operation、advertiserId（必要时脱敏）和耗时，但不能包含 Token 或完整请求体。

## 7. P2：当前可以保留，不要过度设计

### P2-1 当前单机 JSON 不需要立即替换数据库

在“一个 Electron 进程、一个本地用户、任务数量有限”的范围内，JSON + 原子写入可以继续使用。只有出现以下条件之一时再切 SQLite：

- 执行记录需要长期保留并查询；
- 任务数达到明显影响全量读写的规模；
- 需要多进程/多窗口并发写入；
- 需要复杂筛选、排序、统计；
- 需要本地迁移和灾备能力。

### P2-2 当前不需要提前做多平台统一抽象

可以预留 `AdPlatformGateway` 的应用层接口，但不要现在为了“未来可能支持其他平台”做复杂的通用字段模型。先把千川平台适配器隔离好，等第二个平台真实出现后再提炼最小交集。

### P2-3 当前不需要引入完整事件总线

监控任务变更、授权变化和数据刷新先使用明确的应用事件/查询失效接口即可。只有当通知、审计、执行记录、报表和多模块联动明显增多时，再引入进程内事件总线。届时事件必须是稳定的领域事件，而不是直接广播平台原始响应。

### P2-4 当前不需要云端调度

应用关闭后监控停止是当前产品约定。不要为了“24 小时运行”提前把本地监控搬到 OAuth 服务端。若未来明确需要云端运行，应单独设计云端任务服务、租户、权限、队列和审计，不应把现有 OAuth 服务继续膨胀成业务后端。

## 8. 推荐目标目录

```text
src/
  main.ts                         # 仅组合根和生命周期
  preload.ts                      # 仅安全桥
  shared/
    contracts/                    # IPC 输入/输出 DTO、Zod Schema、版本化协议
      auth.v1.ts
      promotion-plans.v1.ts
      monitor-tasks.v1.ts
      common.ts
    domain/                       # 仅真正跨进程共享的纯值对象/格式化逻辑
  main/
    domain/                       # 主进程业务实体、规则、错误
      promotion-plan/
      monitor-task/
      auth/
    application/                  # 用例和函数记录，仅依赖 domain 类型
      auth/
      promotion-plans/
      monitor-tasks/
      reporting/
      capabilities/
    infrastructure/               # 具体实现
      oauth/
      qianchuan/
      persistence/
      notifications/
      scheduling/
      logging/
    ipc/                          # 按模块注册 Handler、sender 校验、安全错误映射
      auth/
      promotion-plans/
      monitor-tasks/
  renderer/
    app/
    features/
      auth/
      promotion-plans/
      promotion-data/
      monitor-tasks/
    shared/
      api/                        # 只调用 preload，并解析 DTO
      model/                      # 页面模型和 Query key
      ui/
```

目录不是目的。真正必须遵守的是依赖方向：

```text
Renderer → Shared Contracts
Preload → Shared Contracts
IPC → Application
Application → Domain + 函数记录
Infrastructure → Application 函数记录 + Domain
```

禁止：

```text
Application ✕→ Infrastructure 具体实现
Renderer → main/*
Renderer → platform API / OAuth URL
Shared Contracts → node:fs / electron / fetch
```

## 9. 分阶段迁移计划

### 阶段 A：先固定安全和协议边界

1. OAuth 服务默认绑定回环地址；
2. OAuth 授权尝试和当前授权按客户端/安装实例隔离；
3. 给 OAuth 端点增加客户端会话认证或明确的本地-only 模式；
4. 增加 IPC sender 校验，确保只有受信任主窗口可以调用；
5. 建立统一 `Result<T>` 和错误码，不再向 Renderer 透传任意平台状态。

### 阶段 B：抽离非授权业务的应用能力函数

> OAuth 客户端与用户隔离暂不纳入本阶段，等待 OAuth 服务端新契约稳定后再两端联动调整。

1. [已完成第一轮] 将千川计划查询和写入能力改为显式函数记录；
2. [已完成第一轮] 将监控任务存储和应用服务改为显式函数记录；调度器仍需继续拆分并发、取消和重试策略；
3. [已完成第一轮] 将平台 URL、请求参数、响应标准化集中留在 `infrastructure/qianchuan`；
4. [已完成第一轮] 让计划应用用例只依赖能力函数，不引用 Infrastructure 具体返回类型；
5. [已完成第一轮] 计划应用服务测试直接传入测试函数，不再 Mock HTTP 客户端；
6. [暂缓] OAuth 客户端与用户隔离等待服务端新契约，不在 Electron 侧创建临时兼容层。

### 阶段 C：拆分查询和领域模型

1. 新增 Application Query：计划列表、详情、指标、监控读取；
2. Renderer 输入统一改成 camelCase 应用 DTO；
3. 主进程负责平台字段映射、分页和默认状态；
4. 普通计划列表默认不含已删除数据，历史查询独立；
5. 统一 Query key、广告主切换时的缓存清理和请求去重。

### 阶段 D：升级监控执行模型

1. 保持 scheduler 内的规则判断为纯函数；
2. 保留按广告主互斥，不提前增加通用并发、重试或队列设施；
3. 只有出现明确需求时，再评估取消、重试或历史执行记录；
4. 继续用当前页面真实需要来约束返回结构。

### 阶段 E：以垂直切片接入新业务

以后新增“数据报表”“乘方管理”“素材管理”等模块时，固定使用以下顺序：

```text
业务用例 → 能力函数 → Infrastructure Adapter → IPC Contract → Preload → Renderer Feature
```

不要先在页面里调用平台字段，也不要为了复用而把所有模块塞进一个万能 `useWorkspacePlans` 或一个万能 API 客户端。

## 10. 后续开发规则

1. 每个业务模块必须有自己的用例函数集合，不把新逻辑继续堆到 `PromotionPlanService`。
2. 每个外部能力都必须以函数或函数记录传入；HTTP 客户端只是边界实现，不是业务依赖。
3. 页面只能使用 Renderer DTO，不能依赖平台原始响应字段。
4. 所有写操作必须有“读取最新状态 → 校验归属/版本 → 生成白名单命令 → 用户确认 → 执行 → 复读/审计”的流程。
5. 所有来自 IPC、OAuth、巨量平台、文件的输入都在边界处做运行时校验。
6. Access Token 不落盘、不进日志、不进 Renderer；退出后通过 OAuth 服务端重新恢复。
7. 默认查询只读取有效数据；历史数据、已删除数据和报表数据必须有单独查询语义。
8. 不为暂时没有真实需求的多平台、云端调度、完整事件总线和复杂数据库提前设计实现。
9. 每个新模块至少补齐：契约测试、应用服务测试、基础设施适配器测试和一个 Renderer 查询/交互测试。
10. 任何底层协议或目录调整，先更新本文对应的边界，再改代码，避免“先写页面、后补架构”。

## 11. 最终判断

当前不是推倒重来，而是进入“边界已收口，按真实需求扩业务”的阶段。新版 OAuth 产品用户会话和多授权隔离已经落地，Electron 不再保留旧接口兼容层。

后续 Electron 侧继续维护以下基础边界：

1. Application 与 Infrastructure 的依赖通过显式函数参数和函数记录隔离；
2. IPC 错误和 DTO 契约稳定化；
3. 平台查询模型与应用查询模型分离；
4. 监控调度器从定时器脚本演进为可控的执行用例；
5. 通过函数类型、函数记录和组合根固定依赖组装方式。

服务端新契约稳定后，再由两端一起处理客户端身份、授权尝试和授权记录隔离。这样可以避免先做一套必然推翻的客户端身份模型，同时保证后续业务模块沿着垂直切片新增，不需要反复改动 Token、IPC、平台适配和本地持久化这些底层基础。

## 12. 当前实施进度

截至 2026 年 9 月 8 日，已完成前两条垂直整改切片：

1. 新增 `src/main/application/capabilities/oauth.ts`，用函数记录描述 OAuth 最小能力，Application 不再依赖 HTTP 客户端实现。
2. `AuthService` 仅依赖 OAuth 能力、系统浏览器打开函数和当前时间函数，保留授权恢复并发合并、主进程 Token 缓存、Token 裁剪和有限刷新行为。
3. `src/main/infrastructure/oauth-server-client.ts` 负责协议字段归一化和稳定错误映射；`src/main.ts` 负责真实实现组装。
4. OAuth 客户端测试与 AuthService 测试已拆开，分别验证 HTTP 协议边界和应用行为。
5. `JsonRecord` 已从 OAuth 客户端模块抽离，避免其他 Infrastructure 模块依赖不相关的 OAuth 实现。
6. 计划列表 IPC 已切换到统一 `Result<T>`：主进程负责错误分类和输出 Schema 校验，Renderer 只消费 `ok/data/error`；旧 `list()` 仅暂留给监控调度器内部使用。
7. 计划详情 IPC 已同步切换为 `Result<PromotionPlanDetailData>`；旧详情结构仅保留在主进程 Application/Infrastructure 内部兼容路径。
8. Renderer 的计划列表与详情 Query Key 已集中为纯函数工厂，并覆盖完整业务查询条件；普通工作台默认列表口径已从 `ALL_INCLUDE_DELETED` 收敛为 `ALL`。
9. 已补齐共享契约、Application、IPC 和 Query Key 测试，验证未知字段裁剪、输入校验、网络/鉴权/业务错误映射、非法结果阻断和缓存隔离。

这一切片不改变 OAuth 服务端的客户端/用户隔离协议；该问题仍按原计划等待服务端契约稳定后联动处理。Slice 2 已完成：计划列表 IPC 已统一为 `Result<PromotionPlanListData>`，并完成输入/输出白名单、错误分类和边界测试。计划详情 IPC 也已迁移为 `Result<PromotionPlanDetailData>`，旧详情模型只作为主进程内部兼容层保留。Slice 3 已开始：Renderer 的列表与详情 Query Key 已由纯函数工厂集中生成，完整包含广告主、筛选、日期、分页和计划 ID；本轮新增独立的监控候选计划查询用例和 IPC，普通工作台/监控创建页查询参数已提取为纯函数。历史/已删除列表语义与监控执行模型继续按后续切片推进。

## 13. 解决方案设计记录

针对本评审列出的 P0/P1 问题，已建立单独的渐进式解决方案记录：

- 方案文档：`docs/architecture-remediation-plan.md`
- 函数式编程规则：`docs/functional-architecture-rules.md`
- 项目强约束：`AGENTS.md`

当前执行原则是：不做一次性大重构，先通过最小垂直切片清理 Application 与 Infrastructure 依赖，并已完成计划列表、计划详情的 IPC Result 稳定化以及 Query Key 缓存隔离；下一步拆分查询语义和监控执行模型。OAuth 客户端身份隔离继续等待配套 OAuth 服务端契约稳定，不在 Electron 侧设计临时方案。
