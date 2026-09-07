# qianchuan-electron Handoff 文档

> 生成时间：2026-09-07  
> 分支：`dev`  
> 最新提交：`b4a63f2 fix: refresh qianchuan tokens without exposing secrets`  
> 配套仓库：`/Users/yaotutu/Desktop/code/dianxiaoqi-qianchuan/qianchuan-oauth-callback`

---

## 1. 项目一句话定位

“电小奇 · 千川超级商品卡”的 Electron 桌面客户端，当前核心功能是：

- 巨量千川 OAuth 授权；
- 广告主 / 店铺选择；
- 商品投放计划列表展示；
- 本地推广监控任务管理；
- **计划详情标准化、预算 / 支付 ROI 修改预览与受控写入**。

---

## 2. 当前状态总览

| 维度                   | 状态                                                     |
| ---------------------- | -------------------------------------------------------- |
| 分支                   | `dev`                                                    |
| Git 工作区             | 有本轮未提交变更，未包含凭据或生成产物                   |
| 类型检查               | ✅ 通过（renderer + electron）                           |
| 单元测试               | ✅ 16 文件 / 71 测试全部通过                             |
| 格式检查               | ✅ 通过                                                  |
| 构建                   | ✅ 通过（renderer + electron + preload）                 |
| 真实授权               | ✅ 已跑通                                                |
| 真实计划列表           | ✅ 已读到 71 个商品推广计划                              |
| 真实计划详情请求       | ✅ 官方接口返回成功                                      |
| 计划详情标准化         | ✅ 已完成，详情抽屉接收白名单 `snapshot`                 |
| 预算 / 支付 ROI 写操作 | ✅ 已接入主进程安全写链路，测试使用 Mock，未发真实写请求 |
| 监控任务执行           | ✅ 已完成手动检查、规则执行、通知与本地结果落盘          |
| 工作台 6 个模块        | ✅ 已完成 MVP 页面与路由                                 |
| 第五项                 | ⏸️ 按用户要求暂缓                                        |

---

## 3. 关键架构决策（已落地）

### 3.1 授权与数据流

```text
登录：
Electron → /oauth/oceanengine/start → 系统浏览器授权
→ 巨量回调 OAuth 服务 → 服务端安全保存 Token

日常业务：
Electron 主进程启动或需要恢复授权时
→ 请求 OAuth 服务端 `/oauth/current`
→ 服务端读取加密授权，必要时用 Refresh Token 刷新
→ 只把短期 Access Token 返回给 Electron 主进程内存
→ Electron 主进程直接调用巨量 `/open_api/...`
→ 最小 IPC 返回脱敏业务数据

Token 失效：
Electron 检测到明确 Token 失效错误
→ `/oauth/current`
→ 服务端自动刷新并持久化轮换后的 Token
→ Electron 用新 Token 重试一次
```

### 3.2 安全边界

- `App Secret`、`Refresh Token`、`Cookie`、网页凭据只保存在 OAuth 服务端。
- `Access Token` 只保存在 Electron **主进程内存**，不写入磁盘、日志、仓库，不传给 Renderer。
- 应用退出后 Access Token 会自然丢失；下次启动自动请求 `/oauth/current` 恢复，不要求用户重复授权。
- 只有 Refresh Token 过期、授权撤销或权限变化时，才进入重新授权流程。
- Renderer 只通过 `contextBridge` 暴露的最小 API 与主进程通信。
- OAuth 服务端**不代理任何业务接口**，只做授权管家。
- 不实现网页内部接口兼容层；业务请求只允许走巨量官方 `/open_api/...`。

### 3.3 业务逻辑归属

- 所有业务逻辑、监控任务、规则执行、本地持久化保留在 Electron。
- 服务端只在用户明确要求云端运行或 24 小时运行时，才重新评估调度方案。

---

## 4. 代码结构

```text
/Users/yaotutu/Desktop/code/dianxiaoqi-qianchuan/qianchuan-electron
├── agents.md                         # 项目协作规则（最高优先级）
├── HANDOFF.md                        # 本文档
├── package.json
├── src/main.ts                       # Electron 入口、窗口、IPC 注册
├── src/preload.ts                    # contextBridge 安全桥
├── src/main/
│   ├── application/
│   │   ├── auth-service.ts           # 授权状态、TokenProvider、/oauth/current 调用
│   │   ├── promotion-plan-service.ts # 计划列表、详情、监控批量读取
│   │   └── monitor-task-service.ts   # 监控任务 CRUD、调度触发
│   ├── infrastructure/
│   │   ├── qianchuan-api-client.ts   # 巨量 /open_api/... HTTP 客户端
│   │   ├── qianchuan-domain.ts       # 计划列表参数解析 + 详情白名单标准化
│   │   ├── oauth-server-client.ts    # OAuth 服务端 HTTP 客户端
│   │   ├── json-monitor-task-repository.ts
│   │   └── electron-monitor-notifier.ts
│   ├── ipc/register-ipc-handlers.ts  # 所有 IPC handler 注册
│   └── monitor-scheduler.ts          # 本地监控调度器
├── src/renderer/
│   ├── features/
│   │   ├── auth/                     # 登录页、授权状态门
│   │   ├── promotion-monitor/        # 推广监控：列表、筛选、任务、详情与修改
│   │   ├── account-management/       # 账号管理 MVP
│   │   ├── promotion-management/     # 推广管理 MVP
│   │   ├── promotion-data/           # 推广数据 MVP
│   │   ├── multiplier/               # 乘方管理、监控和数据 MVP
│   │   └── workspace-plans/          # 工作台计划数据模型与复用组件
│   ├── shared/
│   │   ├── api/qianchuan-api.ts      # Renderer 调用 preload 的适配层
│   │   ├── contracts/                # Zod Schema + TypeScript 类型（含详情 Snapshot）
│   │   └── utils/
│   └── app/                          # Provider、路由、QueryClient、Store
└── src/shared/contracts/             # 跨主进程与 Renderer 的契约
```

配套 OAuth 服务端：

```text
/Users/yaotutu/Desktop/code/dianxiaoqi-qianchuan/qianchuan-oauth-callback
├── src/                              # Bun + Hono
└── README.md                         # 配置与运行说明
```

---

## 5. 已完成的关键提交

| 提交      | 说明                                                                               |
| --------- | ---------------------------------------------------------------------------------- |
| `b4a63f2` | Access Token 只存主进程内存；Renderer 不再拿到 Token；Token 失效自动刷新；新增测试 |
| `8b1e725` | 格式化千川 API Client 模块                                                         |
| `d19aad5` | 把直接调用巨量 OpenAPI 的数据流沉淀为规则                                          |
| `8c79f42` | 客户端直接调用巨量平台 API，不再经过服务端代理                                     |
| `1c4b282` | 新增计划详情与修改预览骨架                                                         |

---

## 6. 本轮完成项与后续边界

用户本轮要求先完成第一至第四项，第五项暂不处理。当前状态如下。

### 6.1 ✅ 计划详情标准化

已在 `src/main/infrastructure/qianchuan-domain.ts` 增加详情响应标准化，将巨量平台原始响应裁剪为 Renderer 可安全消费的白名单 `PromotionPlanDetailSnapshot`，并由主进程完成：

- 计划身份、投放配置、商品、账号、直播间、素材和高级配置聚合；
- 平台 ID 统一转换为字符串；
- `request_id` 标准化为 `requestId`；
- 使用稳定排序序列化后的业务配置生成 SHA-256 `contentHash`；
- `snapshotId` 只由计划 ID、抓取时间和 Hash 前缀组成；
- 未知平台字段不进入 Renderer；
- `fetchedAt` 与 `snapshotId` 不参与内容 Hash，避免同一配置因抓取时间变化而产生冲突。

`getDetail()` 现在返回标准化结果，详情抽屉可以展示真实字段和素材摘要。

### 6.2 ✅ 预算 / 支付 ROI 真实写操作

当前只开放以下两个官方增量接口：

```text
POST /open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/
POST /open_api/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/
```

主进程写入流程固定为：

```text
重读最新详情
→ 校验广告主 / 计划归属、删除状态和 baseContentHash
→ 基于最新 Snapshot 重新生成白名单命令
→ 校验用户二次确认
→ 按需调用预算 / ROI 官方接口
→ 写后重新读取详情
```

已实现的安全边界：

- Renderer 只能提交草稿和 `confirmed: true`，不能指定 endpoint 或平台载荷；
- 建议预算模式、未支持字段、超出 JavaScript 安全整数范围的 ID 均 fail-closed；
- Token 失效只允许通过 `/oauth/current?force_refresh=true` 刷新并重试一次；
- 两个官方请求不是事务，部分成功会返回 `partial_updated`，并提示刷新详情核对；
- 测试全部使用 Mock，尚未执行真实平台写请求。

名称、投放时间、启停、删除、复制等写操作仍保持关闭。

### 6.3 ✅ 监控任务执行能力

已完善 `runOnce()` 的执行结果统计和页面反馈，支持：

- 读取目标计划当日只读数据；
- 执行本地规则并计算正常、触发、错误、数据缺失数量；
- 将任务最后结果写回本地仓库；
- 仅在状态从非 `TRIGGERED` 进入 `TRIGGERED` 时发送通知；
- 不自动启停、修改或删除真实千川计划。

### 6.4 ✅ 工作台 6 个占位模块 MVP

以下路由已从统一占位页替换为可用 MVP 页面：

```text
/account-management
/promotion-management
/promotion-data
/multiplier-management
/multiplier-monitor
/multiplier-data
```

页面复用现有计划列表、详情和本地监控数据能力，提供账号信息、计划管理入口、数据汇总、全域计划候选和监控概览；未知乘方写接口暂不猜测，也不调用。

### 6.5 ⏸️ 第五项

第五项按用户要求暂不实现，后续需要用户重新确认范围后再开始。

---

## 7. 如何运行

### 7.1 启动 OAuth 服务端

```bash
cd /Users/yaotutu/Desktop/code/dianxiaoqi-qianchuan/qianchuan-oauth-callback
bun run start
```

默认端口 `3100`，健康检查：

```bash
curl http://127.0.0.1:3100/health
```

### 7.2 启动 Electron 开发环境

```bash
cd /Users/yaotutu/Desktop/code/dianxiaoqi-qianchuan/qianchuan-electron
npm run dev
```

这会同时启动：

- Vite Renderer：`http://127.0.0.1:5173`
- Electron 主进程（带 remote-debugging-port=9223）

### 7.3 常用验证命令

```bash
npm run typecheck
npm test
npm run format:check
npm run build
```

当前全部通过。

---

## 8. 测试覆盖

- 16 个测试文件，73 个测试用例全部通过。
- 已通过：`npm run typecheck`、`npm test`、`npm run format:check`、`npm run build`。
- 重点覆盖：
  - OAuth 客户端与 Token 刷新（含 Renderer 不拿到 Token）
  - 计划列表标准化
  - IPC handler 参数校验
  - 监控任务仓库与调度器
  - 计划变更预览逻辑

详情标准化、写入安全边界、监控执行统计和工作台计划模型的测试均已纳入上述测试结果。OAuth 服务端当前通过 20 个集成测试，并通过 Biome 检查。

---

## 9. 重要约束（务必遵守）

- **中文沟通**；JS/TS 优先函数式编程；关键逻辑加详细中文注释。
- Renderer 不得接触 Token、Cookie、`auth_code`、完整请求头。
- 业务请求只使用官方 `/open_api/...`；不保留网页 `/ad/api/...` 兼容层。
- 预算 / 支付 ROI 的代码路径已接入，但测试和当前开发验证不执行真实平台写请求；如需真实写入，必须由用户明确要求并确认具体计划、字段和安全方案。
- 不确定的官方接口字段必须查官方开发手册，不猜测。
- 不提交 `/tmp/qianchuan-plan-detail.json` 或任何含凭据的抓包文件。
- 不回退用户已有改动。

---

## 10. 最近的真实运行验证

- OAuth 服务正常响应 `/health`；
- Electron 正常启动；
- 授权成功后 Renderer 拿到的对象不包含 `accessToken` / `refreshToken`；
- Electron 主进程直接调用 `/open_api/v1.0/qianchuan/uni_promotion/list/` 成功；
- 读到真实商品推广计划 71 条；
- 详情接口 `/open_api/v1.0/qianchuan/uni_promotion/ad/detail/` 请求成功。

---

## 11. 下一任接手建议

1. 继续保持预算 / 支付 ROI 写操作的 fail-closed 边界；如需扩大写入字段，先核对官方开放平台文档并补齐契约、预检、Mock 和写后回读测试。
2. 需要真实验证时，仅先做只读详情和页面交互验证；真实写请求必须由用户明确确认具体计划、字段和安全方案。
3. 关注 Renderer 与主进程 IPC 契约变更，确保 preload、类型声明、Zod 校验和测试同步更新。
4. 第五项暂缓，不要在未重新确认范围前实现。

---

_文档由 Codex 于 2026-09-07 根据当前仓库状态生成。_
