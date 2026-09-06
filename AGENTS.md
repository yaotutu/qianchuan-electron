# qianchuan-electron 项目协作约定

## 1. 项目定位

- 本项目是“电小奇 · 千川超级商品卡”的 Electron 桌面客户端。
- 当前技术栈为 Electron、React 18、TypeScript、Vite、Arco Design、TanStack Query、Zustand、Zod 和 React Router。
- 当前核心功能是巨量千川授权状态展示、广告主/店铺选择、商品投放计划展示，以及本地推广监控任务管理。
- 默认只读取和展示真实千川投放数据。计划启停、预算修改、删除、复制等真实写操作，除非用户明确要求并确认安全方案，否则只保留界面入口，不调用平台写接口。

## 2. 架构边界

### 2.1 Electron 主进程

- 产品业务逻辑优先放在 Electron 主进程，包括监控任务、规则、分组、启停、调度、执行日志和本地持久化。
- 文件系统、系统浏览器、系统通知、定时调度和其他 Node.js 能力只能由主进程负责。
- 主进程可以调用配套 OAuth 服务，但不得在客户端保存巨量应用 Secret、Access Token、Refresh Token、Cookie 或网页登录凭据。
- 应用关闭后不保证监控继续运行。只有用户明确要求云端运行或 24 小时运行时，才重新评估服务端调度方案。

### 2.2 Preload

- Renderer 只能通过 `contextBridge` 暴露的最小 API 与主进程通信。
- 禁止为了开发方便向 Renderer 暴露完整 `ipcRenderer`、Node.js API、文件系统或任意网络代理能力。
- 新增或调整 IPC 时，必须同步修改主进程 handler、preload 暴露接口、Renderer 类型声明、运行时校验和相关测试。
- IPC 返回值应是可序列化、字段明确且不包含敏感凭据的数据。

### 2.3 React Renderer

- Renderer 只负责页面展示、表单交互、查询状态和短生命周期 UI 状态，不直接读写本地文件。
- 服务端数据与异步请求状态优先使用 TanStack Query；跨页面的纯 UI 状态可以使用 Zustand；不要重复维护同一份服务端数据。
- 所有来自 IPC 或网络的外部数据都应在边界处通过 Zod 校验，组件内部使用校验后的类型。
- 页面和组件不得直接拼接巨量平台鉴权请求，也不得接触授权 URL、`auth_code` 或 Token。

### 2.4 OAuth 服务端

- 配套服务端默认仅负责 OAuth 回调、Token 安全存储与自动刷新、广告主发现，以及代理必须使用 Access Token 的只读开放平台请求。
- 不要把本地监控任务、业务 CRUD、调度策略或 UI 状态迁移到服务端。
- 除非用户明确提出云端同步、多人共享或应用关闭后仍需运行，否则保持服务端最小化。

## 3. 目录职责

```text
src/main.ts                         Electron 启动、窗口生命周期、OAuth 与 IPC 注册
src/main/                           本地仓库、任务调度器等主进程业务模块
src/preload.ts                      安全桥和 Renderer 可用 API
src/renderer/app/                   Provider、路由、QueryClient、Store、错误边界
src/renderer/features/              按业务功能组织的页面、组件、Hook 和模型
src/renderer/layouts/               工作台级布局
src/renderer/shared/api/            preload API 适配、数据校验和统一请求边界
src/renderer/shared/model/          跨功能业务类型和 Zod Schema
src/renderer/shared/utils/          无副作用的格式化及通用函数
src/renderer/shared/ui/             通用 UI 与反馈封装
src/renderer/styles/                全局样式和设计 Token
scripts/                            本地开发与构建辅助脚本
```

- 新功能优先放入独立的 `src/renderer/features/<feature-name>/`，不要持续扩大 `App.tsx`、路由文件或布局组件。
- 只在确实跨功能复用时才移动到 `shared`，不要过早抽象。
- `src/index.html`、`src/renderer.js`、`src/styles.css` 是旧版 Renderer 的回退参考。除非任务明确涉及旧版页面，否则不要在其中实现新功能。
- `dist/`、`dist-electron/`、`node_modules/` 属于生成内容，不应手工编辑或提交。

## 4. 编码约定

- JavaScript/TypeScript 优先使用函数式编程：纯函数、不可变数据、显式输入输出和组合式逻辑。
- React 使用函数组件和 Hooks，不新增 class component。
- 新增或修改关键业务逻辑时添加详细中文注释，重点说明业务原因、边界条件和安全约束；不要只把代码逐行翻译成注释。
- 保持模块职责单一。复杂组件应拆分为页面容器、展示组件、业务 Hook 和纯模型函数。
- 不使用 `any` 绕过类型系统；确需处理未知输入时使用 `unknown`，并通过类型守卫或 Zod 缩窄。
- 错误提示应转换成用户可理解的中文，同时保留适合本地调试的非敏感上下文。
- 避免在 UI 中静默吞掉错误，也不要向用户展示 Token、请求头、内部堆栈或平台敏感返回。
- 新增依赖前先判断现有技术栈是否已经能够完成需求，避免引入功能重复的库。

## 5. 数据与监控任务约定

- 监控任务是 Electron 本地数据，持久化由主进程负责，Renderer 不直接操作存储文件。
- 存储文件不存在时应视为空数据，而不是异常。
- 本地持久化写入应考虑数据校验、异常恢复和原子性，避免半写入导致数据损坏。
- 调度器和任务仓库应保持可注入时间、文件路径或外部依赖，便于编写确定性的单元测试。
- 当前监控功能只做通知、状态计算和执行记录，不自动操作真实千川计划。

## 6. 巨量千川页面与接口调查

- 本机已配置 `firefox-devtools` MCP，用户已在 Firefox 登录巨量千川。核对网页字段、控制台和网络请求时，优先连接现有 Firefox 会话。
- 默认只读取和诊断网页。除非用户明确授权，不在千川页面创建计划、修改预算、启停计划、充值或执行其他写操作。
- 千川网页的 `/ad/api/...` 属于网页登录态内部接口，不能直接当作开放平台 `/open_api/...` 接口写入产品代码。
- 不得把 Cookie、Authorization、Access Token、Refresh Token、`msToken`、`a_bogus`、`verifyFp`、完整请求头或抓包凭据保存到仓库、测试夹具、日志或回复。
- 临时抓包文件完成分析后应删除，尤其是包含请求头、Cookie 和安全参数的文件。

## 7. 开发与验证

常用命令：

```bash
npm run dev
npm run typecheck
npm test
npm run format:check
npm run build
```

完成代码修改后至少执行与改动范围对应的检查：

- 修改 TypeScript、IPC、模型或组件：运行 `npm run typecheck`。
- 修改业务逻辑、Schema、任务仓库或调度器：补充/更新测试并运行 `npm test`。
- 修改格式检查覆盖范围内的文件：运行 `npm run format:check`。
- 修改 Electron 入口、preload、Vite 配置或构建流程：运行完整 `npm run build`。
- 提交前运行 `git status --short`，确认未提交 `.env`、Token 文件、日志、构建产物或临时抓包。

## 8. 开发态运行注意事项

- `npm run dev` 由 Vite Renderer 和 `scripts/dev-electron.mjs` 共同驱动。
- 修改 `src/main.ts`、`src/preload.ts` 或 `src/main/**/*.ts` 后，开发脚本应重新编译并重启 Electron。
- 如果 Renderer 提示 IPC 方法不存在，先确认 Electron 主进程/preload 是否已重启，不要直接把问题误判为本地数据损坏。
- 开发态与生产态必须保持相同的 preload API 和 IPC 协议。

## 9. Git 提交约定

- 一个提交只包含一个清晰主题，提交信息使用简洁的 Conventional Commits 风格，例如 `feat:`、`fix:`、`refactor:`、`test:`、`docs:`。
- 不修改或回退用户已有但与当前任务无关的变更。
- 不使用空提交，也不为了“看起来有进展”提交生成文件。
- 未经用户明确要求，不执行强制推送、历史重写或删除远程分支等破坏性操作。
