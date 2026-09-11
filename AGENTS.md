# qianchuan-electron 项目协作约定

> 最后更新：2026-09-11
>
> 本文件记录当前仓库的强约束。更完整的函数式架构说明见 `docs/functional-architecture-rules.md`，架构问题与迁移顺序见 `docs/architecture-review.md`。

## 用户手动添加的规则，优先级最高，禁止修改

- 避免过度设计

## 1. 项目定位与当前能力

- 本项目是“电小奇 · 千川超级商品卡”的 Electron 桌面客户端。
- 当前技术栈为 Electron 44、React 18、TypeScript 6、Vite 8、Arco Design、TanStack Query、Zustand、Zod 和 React Router。
- 当前核心能力包括产品用户登录与会话恢复、多巨量千川 OAuth 授权管理、广告主/店铺选择、商品投放计划列表与详情、本地推广监控任务，以及预算和支付 ROI 的受控写入链路。
- 默认以只读查询和诊断为主。预算、支付 ROI 等真实写操作即使已有代码路径，也必须由用户明确要求并确认具体广告主、计划、字段、目标值和安全方案后才能执行。
- 当前只允许使用已核实的官方增量接口修改预算和支付 ROI。计划名称、投放时间、启停、删除、复制及其他写操作继续保持关闭，不得根据网页内部接口或猜测字段补齐实现。

## 2. 总体架构原则

### 2.1 函数式核心，命令式外壳

- JavaScript/TypeScript 业务代码优先使用纯函数、不可变数据、显式输入输出、高阶函数、闭包、判别联合和函数记录。
- 新业务默认不使用 `class`、继承、通过 `this` 保存可变业务状态、全局单例服务、服务定位器或万能 `Service` / `Manager`。
- React 只使用函数组件和 Hooks，不新增 class component。
- 查询参数归一化、平台响应映射、规则计算、状态转换、变更预览、写入前置校验、错误分类和格式化等逻辑应优先写成纯函数。
- `fetch`、文件系统、Electron API、IPC、通知、定时器、日志、当前时间和随机数等副作用必须收口在边界，或通过函数参数显式注入。
- Application 用例通过最小能力函数或函数记录接收依赖，不直接寻找或实例化 Infrastructure；所有实现统一在 `src/main.ts` 组合根组装。

### 2.2 函数式编程范式优先级（强制规则）

- 在 JavaScript/TypeScript 中，默认优先使用函数式编程范式：纯函数、不可变数据、显式输入输出、函数组合、高阶函数、闭包、判别联合和函数记录。
- 可以成为纯函数的查询归一化、数据映射、规则计算、状态转换、变更预览、错误分类和格式化逻辑，必须优先实现为纯函数。
- 副作用（网络、文件、Electron API、IPC、通知、定时器、当前时间和随机数）必须集中在边界适配器，或作为显式函数依赖传入；不得隐藏在业务函数内部。
- 新增业务默认禁止使用 `class`、继承、通过 `this` 保存可变业务状态、全局单例和万能 `Service` / `Manager`；确有必要时必须在代码评审中说明原因。
- 修改已有代码时不得为了“顺手重构”扩大范围；应先保持现有协议兼容，再用最小垂直切片逐步迁移到函数式边界。

### 2.2 最小实现，避免过度设计（强制规则）

- 优先解决当前明确的用户问题和产品需求，不为尚未出现的场景预先建设平台级架构。
- 能用一个普通函数、一个清晰的数据结构或现有模块解决的问题，不得新增 Service、Coordinator、Gateway、Manager、事件总线、队列或额外抽象层。
- 只有在出现真实的重复逻辑、明确的安全风险、实际的性能问题或可复现的测试困难时，才允许引入新的抽象；新增抽象必须同时说明它解决的当前问题、替代方案以及后续维护成本。
- 不提前实现取消、重试、执行记录、缓存、并发控制、插件化或多租户等未来能力，除非当前需求已经明确要求，或现有行为已经出现可验证的问题。
- 每次改动优先采用最小垂直切片：保持现有 IPC、页面行为和数据结构兼容，避免跨模块、跨协议的大范围重构。
- 架构文档应记录已存在且正在使用的边界，不应把计划中的理想结构描述成当前实现；如果用户难以理解改动，应先简化方案和命名，而不是继续增加文档或抽象。
- 在提交代码前，必须能用简短中文说明“改了什么、解决哪个当前问题、为什么不能更简单”；无法说明时停止扩展设计并重新收敛。

### 2.3 模型与依赖方向

依赖方向固定为：

```text
Renderer → Preload / IPC Contract → Application Use Cases → Capability Functions
                                                        ↑
                                                Infrastructure Adapters
```

- `src/main.ts` 是主进程组合根，只负责读取启动配置、创建适配器、组装用例、注册 IPC 和管理 Electron 生命周期。
- `src/main/application/` 负责用例编排，只依赖显式能力函数、稳定应用模型和共享领域纯函数，不得 import 具体 Infrastructure 实现。
- `src/main/application/capabilities/` 描述应用层真正需要的最小函数能力；不要为了“未来可能复用”创建包含大量无关方法的万能 Gateway。
- `src/main/infrastructure/` 负责 HTTP、平台 DTO 映射、OAuth 客户端、文件持久化、系统通知等副作用，不承载页面决策或业务规则。
- `src/shared/contracts/` 是主进程、preload 和 Renderer 之间的跨进程协议；使用稳定的业务语义和 camelCase，不泄漏千川平台 snake_case 字段。
- `src/shared/domain/` 只放跨边界可复用的纯领域逻辑，不依赖 Electron、React、文件系统或网络。
- Renderer DTO、应用查询模型、平台请求 DTO 必须保持分离；映射只能发生在对应边界，禁止把平台原始大对象直接透传到 Renderer。

## 3. Electron 安全边界

### 3.1 主进程

- 产品业务逻辑优先放在 Electron 主进程，包括监控任务、规则、分组、启停、调度、检查结果和本地持久化。
- 文件系统、系统浏览器、系统通知、定时调度和其他 Node.js 能力只能由主进程负责。
- 主进程负责获取短期有效的 Access Token，并直接调用巨量官方 `/open_api/...` 完成业务查询与经确认的写入；不得通过配套 OAuth 服务代理业务接口。
- 巨量 App Secret、巨量 Refresh Token、Cookie 和网页登录凭据只能保存在配套 OAuth 服务端。产品 Access Token 和巨量 Access Token 只允许在 Electron 主进程内存中短期持有，不得写入磁盘、日志、仓库、测试夹具或传递给 Renderer。
- 产品 Refresh Token 只允许由主进程通过 Electron `safeStorage` 加密保存，用于应用重启后的产品会话恢复；不得传递给 Renderer 或以明文形式落盘。
- 巨量平台明确返回 Token 失效时，主进程只能使用当前产品会话调用 `/oauth/accounts/{authorizationId}/token` 重新获取指定授权的短期 Access Token，并对原业务请求做一次有边界重试，禁止无限重试。
- 应用关闭后监控定时任务停止是预期行为；监控永远只在 Electron 客户端运行，不设计云端业务调度。
- 自动更新只在打包应用中由主进程通过 electron-updater 检查 GitHub 的 DEV 正式 Release；更新状态通过最小 IPC 脱敏传给 Renderer，下载完成后由用户重启安装。更新失败不得阻塞启动。

### 3.2 职责边界不可变规则

以下规则是本产品的架构硬约束，后续需求、重构和文档不得遗忘或弱化：

> **总规则：OAuth 服务端只做授权基础设施，Electron 客户端承载全部业务；监控仅在客户端运行，软件关闭即停止；所有请求-响应型 IPC 统一返回 `Result<T>`。**


1. **OAuth 服务端只负责授权基础设施**：产品会话、巨量 OAuth 授权、Token 安全保存/刷新和授权账号管理属于服务端；客户端不自行实现 OAuth 授权，服务端也不承载业务。
2. **所有业务永远在 Electron 客户端**：计划查询、计划写入、监控任务、规则、调度、执行结果、本地持久化和通知均由客户端主进程负责；不得把业务接口代理、业务 CRUD、监控 Worker 或业务数据库放入 OAuth 服务端。
3. **监控任务只在软件运行期间执行**：任务属于客户端本地运行时，软件关闭后定时任务停止或消失是符合预期的产品行为，不得以“持续运行”为理由设计云端调度。

日常业务调用固定为：Electron 主进程向 OAuth 服务端获取指定授权的短期巨量 Access Token，然后直接调用巨量官方 OpenAPI；OAuth 服务端不代理巨量业务接口。

### 3.3 Preload 与 IPC

- Renderer 只能通过 `contextBridge` 暴露的 `window.qianchuan` 最小 API 与主进程通信。
- 禁止向 Renderer 暴露完整 `ipcRenderer`、`shell`、Node.js API、文件系统或任意网络代理能力。
- IPC 是稳定协议，不是主进程函数直通。每个方法都必须有明确输入 Schema、输出 Schema、安全错误转换和契约测试。
- 新增或调整 IPC 时，必须同步修改：
  1. `src/shared/contracts/` 中的 Schema、类型和 channel；
  2. `src/main/ipc/register-ipc-handlers.ts`；
  3. `src/preload.ts`；
  4. `src/shared/contracts/bridge.ts`；
  5. `src/renderer/shared/api/` 的适配与返回值校验；
  6. 相关契约、IPC 和页面测试。
- IPC 输入即使已有 TypeScript 类型，也必须在主进程边界再次通过 Zod 校验；返回值必须可序列化、字段明确且不包含敏感凭据、内部堆栈或平台原始错误对象。

### 3.4 React Renderer

- Renderer 只负责页面展示、表单交互、路由、查询状态和短生命周期 UI 状态，不直接读写本地文件，不直接调用巨量或 OAuth HTTP 接口。
- 平台数据和本地任务等异步状态优先使用 TanStack Query；Zustand 只保存当前广告主、筛选条件、选中项和显示偏好等纯 UI 状态。
- 不要把同一份计划、详情或任务数据同时维护在 Query Cache 和 Zustand 中。
- 所有来自 IPC 的未知返回值都应在 `src/renderer/shared/api/` 边界通过 Zod 校验，组件内部只使用校验后的稳定类型。
- 页面和组件不得接触授权 URL、`auth_code`、Access Token、Refresh Token、Cookie、平台 endpoint 或可自由拼装的平台 payload。
- 复杂页面应拆为页面容器、展示组件、业务 Hook 和纯模型函数；业务规则不得埋在 JSX、事件回调或请求回调中。

### 3.5 OAuth 服务端

- 配套服务端只负责产品用户会话、巨量 OAuth、巨量 Token 安全存储与刷新，以及按当前产品用户列出和管理其巨量授权；不代理巨量业务接口。
- 产品登录流程固定为：Renderer 通过最小 IPC 提交邮箱和密码 → Electron 主进程调用 `/auth/login` 或 `/auth/register` → 产品 Access Token 仅存主进程内存 → 产品 Refresh Token 通过 `safeStorage` 加密保存。
- 巨量授权流程固定为：Electron 使用产品 Bearer Token 调用 `POST /oauth/oceanengine/start` → 系统浏览器完成授权 → 巨量回调 OAuth 服务 → OAuth 服务安全保存巨量 Token → Electron 轮询 `/oauth/result?attempt_id=...` 并重新读取 `/oauth/accounts`。
- 日常业务流程固定为：Electron 主进程使用产品 Bearer Token 调用 `/oauth/accounts/{authorizationId}/token` 获取指定授权的短期巨量 Access Token → 主进程直接调用巨量官方 `/open_api/...` → 主进程完成校验和业务处理 → 最小 IPC 返回脱敏业务数据。
- 不存在“全局当前授权”；授权列表、授权结果和 Token 获取都必须绑定当前产品用户，客户端切换账号时必须显式使用 `authorizationId`。
- OAuth 服务端不得承载推广计划查询/修改、监控任务、业务 CRUD、调度策略、规则执行或 UI 状态，也不得新增巨量业务接口的通用转发路由。
- Electron 项目与 OAuth 项目保持独立仓库和稳定 HTTP 契约，不通过复制源码、共享运行时包或直接读取对方存储形成隐式耦合。

## 4. 目录职责

```text
src/main.ts                                      Electron 组合根、启动配置与生命周期
src/preload.ts                                   contextBridge 安全桥
src/shared/contracts/                            IPC Schema、类型、channel 与 bridge 协议
src/shared/domain/                               跨进程可复用的纯领域逻辑
src/main/application/                            授权、计划、监控任务、自动更新等应用用例编排
src/main/application/capabilities/               应用层所需的最小能力函数类型
src/main/infrastructure/                         OpenAPI、OAuth、JSON 持久化、更新、通知等适配器
src/main/ipc/                                    IPC 注册与安全错误转换
src/main/windows/                                BrowserWindow 创建与外链策略
src/main/monitor-task-store.ts                    监控任务规则和串行化读改写
src/main/monitor-scheduler.ts                     本地调度、规则执行与通知编排
src/renderer/app/                                Provider、路由、QueryClient、Store、错误边界
src/renderer/features/                           按业务功能组织页面、组件、Hook 和模型
src/renderer/layouts/                            工作台级布局
src/renderer/shared/api/                         preload API 适配、返回值校验和统一请求边界
src/renderer/shared/utils/                       无副作用格式化及通用函数
src/renderer/shared/ui/                          通用 UI 与反馈封装
src/renderer/styles/                             全局样式和设计 Token
scripts/                                         本地开发与构建辅助脚本
docs/                                            架构规则、评审和官方接口调查记录
```

- 新功能优先放入独立的 `src/renderer/features/<feature-name>/` 或对应主进程业务模块，不要持续扩大 `App.tsx`、路由文件、布局组件或 `src/main.ts`。
- 只在确实跨功能复用时才移动到 `shared`，不要过早抽象。
- `src/renderer/index.html` 是当前 Renderer 入口；不要重新引入旧版 `src/index.html`、`src/renderer.js` 或 `src/styles.css` 回退实现。
- `dist/`、`dist-electron/`、`release/`、`node_modules/` 和临时抓包属于生成或本地内容，不应手工编辑或提交。

## 5. 编码与错误处理约定

- 新增或修改关键业务逻辑时添加详细中文注释，重点解释业务原因、边界条件、依赖方向和安全约束，不要只逐行翻译代码。
- 不使用 `any` 绕过类型系统；未知外部输入使用 `unknown`，再通过 Zod、类型守卫或显式解析缩窄。
- 数据更新优先返回新对象、新数组和新的状态值，不修改传入对象，不通过隐式共享引用改变业务状态。
- 用户可预期的失败优先使用判别联合或稳定结果对象表达；未知异常必须在 IPC 边界转换成中文安全错误。
- 错误提示应让用户知道发生了什么和下一步怎么做，同时只保留非敏感调试上下文。
- 避免在 UI 中静默吞掉错误，也不要向用户展示 Token、请求头、内部堆栈、平台原始响应或服务器文件路径。
- 新增依赖前先判断现有技术栈和标准库是否已能完成需求，避免引入重复能力。

## 6. 计划查询与写入安全约定

- 查询输入必须先由跨进程 Schema 校验，再由 Application 归一化为稳定业务查询，最后由 Infrastructure 映射成平台 snake_case 参数。
- 计划详情只向 Renderer 返回白名单 `PromotionPlanDetailSnapshot`，不得透传平台原始详情。
- Renderer 只能提交业务草稿与 `confirmed: true`，不能指定 endpoint、Access Token 或最终平台载荷。
- 当前真实写入仅允许：
  - `POST /open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/`
  - `POST /open_api/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/`
- 写入流程固定为：重读最新详情 → 校验广告主/计划归属、删除状态和 `baseContentHash` → 基于最新快照重新生成白名单命令 → 确认仅包含支持字段 → 调用官方增量接口 → 写后重新读取详情。
- 任一前置条件不满足时必须 fail-closed：清空可执行命令并返回阻塞原因，不能为了“尽量成功”执行部分不确定载荷。
- 预算与 ROI 是两个独立官方请求，不具备跨请求事务。部分成功时必须明确返回 `partial_updated`，不得自动猜测回滚，也不得假报整体成功。
- 建议预算所需的 `estimate_*` 字段、平台未确认的枚举和超出 JavaScript 安全整数范围的 ID 不得由客户端猜测。
- 扩大写字段前必须先核对巨量官方开发手册，更新 `docs/qianchuan-plan-write-api.md`，再补齐契约、领域预检、平台适配器、Mock、写后回读和失败测试。

## 7. 本地数据与监控任务约定

- 监控任务是 Electron 本地业务数据，Renderer 只能通过 IPC 操作，持久化由主进程负责。
- 存储文件不存在时视为空数据；格式损坏、校验失败或写入失败必须明确报错，不能静默覆盖。
- 本地持久化必须先校验再写入，并采用临时文件加原子替换，避免半写入导致数据损坏。
- 调度器、任务 Store 和持久化适配器应通过最小能力函数连接，并保持时间、文件路径、通知和外部查询可注入，以便编写确定性测试。
- 当前监控功能只读取数据、计算状态、记录执行结果和发送通知，不自动启停、修改、删除或复制真实千川计划。
- 通知应基于明确状态变化触发，避免每轮调度重复打扰用户。

## 8. 巨量千川页面与接口调查

- 本项目已在巨量千川开放平台注册为开发者；只能在应用已获接口权限、商家明确授权及平台规则允许的范围内调用官方开放平台接口。
- 遇到字段、权限点、错误码或接口行为不确定时，以巨量千川官方开发手册为准，不根据网页内部请求猜测正式产品实现。
- 本机已配置 `firefox-devtools` MCP，用户已在 Firefox 登录巨量千川。核对网页展示字段、控制台和网络请求时，优先连接现有 Firefox 会话。
- 默认只读取和诊断网页。除非用户明确授权，不在千川网页执行创建计划、修改预算、启停、删除、充值或其他写操作。
- 千川网页 `/ad/api/...` 属于网页登录态内部接口，不能直接当作开放平台 `/open_api/...` 写入产品代码。
- 不得把 Cookie、Authorization、Access Token、Refresh Token、`msToken`、`a_bogus`、`verifyFp`、完整请求头或抓包凭据保存到仓库、测试夹具、日志或回复。
- 临时抓包文件完成分析后立即删除；如果无法确认是否含敏感字段，按敏感文件处理。

## 9. 开发与验证

常用命令：

```bash
npm run dev
npm run typecheck
npm test
npm run format:check
npm run build
npm run package
```

完成修改后至少执行与范围对应的检查：

- 修改 TypeScript、IPC、Schema、应用模型、适配器或组件：运行 `npm run typecheck`。
- 修改业务规则、共享领域函数、平台映射、任务 Store、持久化或调度器：补充/更新测试并运行 `npm test`。
- 修改格式检查覆盖范围内的文件：运行 `npm run format:check`。
- 修改 Electron 入口、preload、IPC、Vite 配置、构建脚本或打包配置：运行完整 `npm run build`。
- 修改发布和安装包相关配置时，再运行 `npm run package`；普通业务修改不要求每次本地打包。
- 提交前运行 `git status --short`，确认未提交 `.env`、Token 文件、日志、构建产物、安装包或临时抓包。

## 10. 开发态运行注意事项

- `npm run dev` 由 Vite Renderer 和 `scripts/dev-electron.mjs` 共同驱动。
- 修改 `src/main.ts`、`src/preload.ts` 或 `src/main/**/*.ts` 后，开发脚本应重新编译并重启 Electron。
- 如果 Renderer 提示 IPC 方法不存在，先确认主进程和 preload 是否已重启，再检查 bridge、channel 与 Schema 是否同步，不要直接把问题误判为本地数据损坏。
- 开发态与生产态必须保持相同的 preload API、IPC 协议和安全边界。
- OAuth 服务暂时不可用时，应用仍应能打开并展示可理解的恢复提示；不得为了绕过本地联调问题将 Token 或业务请求下放到 Renderer。

## 11. Git 与文档维护

- 一个提交只包含一个清晰主题，提交信息使用简洁的 Conventional Commits 风格，例如 `feat:`、`fix:`、`refactor:`、`test:`、`docs:`。
- 不修改、覆盖或回退用户已有但与当前任务无关的变更。
- 不使用空提交，也不为了“看起来有进展”提交生成文件。
- 未经用户明确要求，不执行强制推送、历史重写、删除远程分支或其他破坏性 Git 操作。
- 架构边界、目录职责、写接口白名单或验证命令发生变化时，同步更新 `AGENTS.md` 和对应 `docs/`，避免协作规则与代码事实漂移。
