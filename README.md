# 电小奇 · 千川 Electron 客户端

当前客户端负责桌面登录交互和千川超级商品卡工作台展示，不直接访问巨量接口。敏感 OAuth 操作由配套的 `qianchuan-oauth-callback` 服务端完成。

## 当前技术栈

```text
Electron + React + TypeScript + Vite
Arco Design          后台界面组件
TanStack Query       服务端数据、请求状态和缓存
Zustand              本地工作台 UI 状态
Zod                  IPC 返回数据的运行时校验
React Router         Electron 本地页面路由
```

本次迁移采用“先迁移 Renderer、保留主进程协议”的方式，现有服务端和 OAuth 接口不需要同步大改。旧版 `src/index.html`、`src/renderer.js`、`src/styles.css` 暂时保留，便于排查和回退；应用启动时使用新的 React 构建产物。

## 启动

先启动服务端并确认它已经是当前版本：

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
npm run typecheck       # TypeScript 类型检查
npm run build:renderer  # 构建 React Renderer
npm test                # 运行单元测试
```

## 登录流程

1. React 通过 TanStack Query 调用 preload 暴露的健康检查和当前授权接口；
2. 用户点击登录后，Electron 主进程请求 `/oauth/oceanengine/start?format=json`；
3. 主进程保存服务端返回的 `attemptId`，并使用系统浏览器打开授权 URL；
4. 巨量回调到服务端后，服务端换 Token 并获取用户信息；
5. React 通过 Query 定时轮询 `/oauth/result?attempt_id=...`；
6. 登录成功后，工作台使用服务端返回的广告主账号列表和商品投放计划。

Electron Renderer 不接触 App Secret、Access Token、Refresh Token、`auth_code` 或完整授权 URL。

## 商品投放计划

登录成功后，千川超级商品卡工作台展示授权店铺的商品投放计划，当前支持：

- 账号搜索、当前账号切换和全选；
- 关键词、投放状态、计划类型和创建时间筛选；
- 推广监控管理和推广监控创建页面占位；
- 计划分页、刷新、全选和状态展示；
- 消耗、支付 ROI、创建时间等读取字段展示；
- 计划启停、编辑、复制、删除等写操作暂时只保留界面入口并提示未接入，避免误操作真实投放计划。

## 目录

```text
src/
├── main.js                         # Electron 主进程、OAuth 请求和 IPC
├── preload.js                      # 安全桥，按 auth / promotionMonitor 分组暴露能力
├── index.html                      # 旧版页面入口，暂作回退参考
├── renderer.js                     # 旧版 Renderer，暂作回退参考
├── styles.css                      # 旧版样式，暂作回退参考
└── renderer/                       # React Renderer 新入口
    ├── main.tsx                    # React 根节点
    ├── App.tsx                     # 主题和认证边界
    ├── app/                        # Provider、QueryClient、Zustand Store
    ├── layouts/WorkspaceLayout/    # 顶栏、产品导航、账号栏和内容容器
    ├── features/auth/              # OAuth 状态恢复、登录轮询和登录页
    ├── features/promotion-monitor/ # 推广监控列表、筛选和分页
    ├── shared/api/                 # preload API 适配和 Zod 校验
    ├── shared/model/               # 业务类型、数据 Schema
    ├── shared/utils/               # 金额、日期和指标格式化
    └── styles/                     # 设计 Token 和全局布局样式
```
