# 电小奇 · 千川 Electron 客户端

当前客户端负责桌面登录交互、千川超级商品卡工作台和本地推广监控。Electron 主进程直接调用巨量官方 `/open_api/...` 接口；独立部署的 `qianchuan-oauth-callback` 只负责 OAuth 授权、Refresh Token 加密持久化和 Access Token 自动刷新。

两个项目目前位于同一工作区，后续会拆成两个独立仓库维护。Electron 项目只依赖 OAuth 服务端约定的 HTTP 接口，不建立 monorepo，也不共享运行时包。

## 当前技术栈

```text
Electron + React + TypeScript + Vite
Arco Design          后台界面组件
TanStack Query       服务端数据、请求状态和缓存
Zustand              本地工作台 UI 状态
Zod                  IPC 返回数据的运行时校验
React Router         Electron 本地页面路由
```

## 启动

先启动独立 OAuth 服务端并确认它已经是当前版本：

```bash
cd /Users/yaotutu/Desktop/code/dianxiaoqi-qianchuan/qianchuan-oauth-callback
npm start
```

然后启动 Electron：

```bash
cd /Users/yaotutu/Desktop/code/dianxiaoqi-qianchuan/qianchuan-electron
npm install
npm start
```

默认连接 `http://127.0.0.1:3100`。如服务端部署在其他地址：

```bash
QIANCHUAN_OAUTH_SERVER_URL=https://你的服务端域名 npm start
```

常用开发命令：

```bash
npm run dev             # Vite 热更新 + Electron 开发窗口
npm run typecheck       # TypeScript 类型检查
npm run build:renderer  # 构建 React Renderer
npm run build:electron  # 清理并构建主进程，再把 sandbox preload 打成单文件
npm test                # 运行单元测试
npm run format:check    # 检查源码格式
```

开发模式下 Renderer 通过 Vite Dev Server 加载；生产模式仍使用 `dist/index.html`，因此两种模式的 OAuth 和 IPC 协议保持一致。

## 架构边界

```text
React Renderer
    │ 仅通过 window.qianchuan 调用安全桥
    ▼
preload.ts
    │ 仅暴露按业务分组的最小 IPC API
    ▼
Electron Main
    ├── application/       登录、计划读取、监控任务编排
    ├── infrastructure/    OAuth HTTP 客户端、系统通知、JSON Repository
    ├── ipc/               IPC channel 注册和安全错误转换
    ├── windows/           BrowserWindow 与外链策略
    ├── monitor-task-store 监控任务业务规则与并发写编排
    └── monitor-scheduler   本地监控调度
    │
    ▼
qianchuan-oauth-callback（独立项目）
    ├── OAuth 回调与授权尝试
    └── Access Token 自动刷新与授权恢复

Electron 主进程直接调用巨量官方 `/open_api/...`；OAuth 服务端不代理任何千川业务请求。
```

应用业务状态、监控规则、分组、启停、调度、执行日志和本地持久化全部留在 Electron 主进程。Renderer 只负责界面、路由和查询缓存；服务端不承载客户端任务 CRUD 或调度逻辑。

## 登录流程

1. React 通过 TanStack Query 调用 preload 暴露的健康检查和当前授权接口；
2. Electron 主进程请求 `/oauth/oceanengine/start`；
3. 主进程保存服务端返回的 `attemptId`，并使用系统浏览器打开授权 URL；
4. 巨量回调到独立服务端后，服务端换取并加密保存 Access Token / Refresh Token；
5. React 通过 Query 定时轮询 `/oauth/result?attempt_id=...`，主进程同时缓存短期 Access Token；
6. Electron 主进程直接调用巨量官方 `/open_api/...`，Renderer 只收到脱敏后的广告主和计划数据。

应用重启后不会要求用户每天重新授权：主进程启动时请求 `/oauth/current`，服务端读取加密授权并在需要时用 Refresh Token 刷新，再把新的短期 Access Token 返回给主进程。只有 Refresh Token 过期、授权被撤销或权限发生变化时，才需要重新授权。

Electron Renderer 不接触 App Secret、Access Token、Refresh Token、`auth_code` 或完整授权 URL。Access Token 只在主进程内存中短期存在，不写入磁盘；Refresh Token 永远只在 OAuth 服务端保存和使用。

## 商品投放计划

登录成功后，千川超级商品卡工作台展示授权店铺的商品投放计划，当前支持：

- 账号搜索、当前账号切换和全选；
- 关键词、投放状态、计划类型和创建时间筛选；
- 推广监控管理和推广监控创建页面；
- 计划分页、刷新、全选和状态展示；
- 计划只读详情抽屉，集中查看计划、商品、账号和指标信息；
- 消耗、支付 ROI、创建时间等读取字段展示；
- 计划启停、编辑、复制、删除等写操作暂时只保留界面入口并提示未接入，避免误操作真实投放计划。

## 目录

```text
src/
├── main.ts                         # Electron 组合根与生命周期
├── preload.ts                      # 安全桥，按 auth / promotionMonitor 分组暴露能力
├── shared/contracts/               # Electron 内部跨进程契约，不与 OAuth 项目共享
│   ├── auth.ts                     # 授权和健康状态 Schema / 类型
│   ├── promotion-plan.ts           # 商品投放计划 Schema / 类型
│   ├── monitor-task.ts             # 本地监控任务 Schema / 类型
│   ├── ipc.ts                      # IPC channel 常量
│   └── bridge.ts                   # window.qianchuan 类型
├── main/
│   ├── application/                # 用例编排：授权、计划读取、监控任务
│   │   └── ports/                  # 持久化等基础设施端口
│   ├── infrastructure/             # OAuth HTTP、系统通知和 JSON Repository 适配器
│   ├── ipc/                        # IPC 注册及安全错误转换
│   ├── windows/                    # BrowserWindow 创建与外链策略
│   ├── monitor-task-store.ts       # 任务规则、筛选和串行化读改写
│   ├── monitor-scheduler.ts        # 本地监控调度器
│   └── __tests__/                  # 主进程纯函数和仓库测试
└── renderer/                       # React Renderer
    ├── main.tsx                    # React 根节点
    ├── App.tsx                     # 主题和认证边界
    ├── app/                        # Provider、QueryClient、Zustand Store、错误边界和路由
    ├── layouts/WorkspaceLayout/    # 顶栏、产品导航、账号栏和内容容器
    ├── features/auth/              # OAuth 状态恢复、登录轮询和登录页
    ├── features/promotion-monitor/ # 推广监控列表、筛选、分页和数据 Hook
    ├── shared/api/                 # preload API 适配和 Zod 校验
    ├── shared/utils/               # 金额、日期和指标格式化
    └── styles/                     # 设计 Token 和全局布局样式
```

## Dev 分支自动发布

向 `dev` 分支推送提交后，GitHub Actions 会自动执行类型检查、单元测试和构建，并分别生成：

- macOS：Intel/Apple Silicon 的 DMG 和 ZIP；
- Windows：x64 NSIS 安装程序；
- Linux：x64 AppImage。

全部平台打包成功后，流水线会创建名为 `dev-<运行序号>` 的 GitHub 预发布版本并上传安装包。也可以在 GitHub Actions 页面通过 `workflow_dispatch` 手动运行。当前构建未配置代码签名证书，因此 macOS 和 Windows 首次打开时可能显示系统安全提示。
