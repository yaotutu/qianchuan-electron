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
- **计划详情预览与修改草稿**（当前只读，不写平台）。

---

## 2. 当前状态总览

| 维度 | 状态 |
|------|------|
| 分支 | `dev` |
| Git 工作区 | 干净，无未提交变更 |
| 类型检查 | ✅ 通过 |
| 单元测试 | ✅ 13 文件 / 58 测试全部通过 |
| 构建 | ✅ 通过（renderer + electron + preload） |
| 真实授权 | ✅ 已跑通 |
| 真实计划列表 | ✅ 已读到 71 个商品推广计划 |
| 真实计划详情请求 | ✅ 官方接口返回成功 |
| 计划详情标准化 | ⚠️ **尚未完成**，详情抽屉目前拿不到 `snapshot` |
| 计划真实写操作 | ❌ 未接入，仅保留 UI 入口 |

---

## 3. 关键架构决策（已落地）

### 3.1 授权与数据流

```text
登录：
Electron → /oauth/oceanengine/start → 系统浏览器授权
→ 巨量回调 OAuth 服务 → 服务端安全保存 Token

日常业务：
Electron 主进程 → /oauth/current 获取短期 Access Token
→ Electron 主进程直接调用巨量 /open_api/...
→ 最小 IPC 返回脱敏业务数据

Token 失效：
Electron 检测到明确 Token 失效错误
→ /oauth/current
→ 服务端自动刷新
→ Electron 用新 Token 重试一次
```

### 3.2 安全边界

- `App Secret`、`Refresh Token`、`Cookie`、网页凭据只保存在 OAuth 服务端。
- `Access Token` 只保存在 Electron **主进程内存**，不写入磁盘、日志、仓库，不传给 Renderer。
- Renderer 只通过 `contextBridge` 暴露的最小 API 与主进程通信。
- OAuth 服务端**不代理任何业务接口**，只做授权管家。
- 千川网页 `/ad/api/...` 属于网页内部接口，不作为产品实现依据。

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
│   │   ├── qianchuan-domain.ts       # 计划列表参数解析 + 响应标准化（详情函数待补）
│   │   ├── oauth-server-client.ts    # OAuth 服务端 HTTP 客户端
│   │   ├── json-monitor-task-repository.ts
│   │   └── electron-monitor-notifier.ts
│   ├── ipc/register-ipc-handlers.ts  # 所有 IPC handler 注册
│   └── monitor-scheduler.ts          # 本地监控调度器
├── src/renderer/
│   ├── features/
│   │   ├── auth/                     # 登录页、授权状态门
│   │   └── promotion-monitor/        # 推广监控：列表、筛选、任务、详情抽屉、修改预览
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
├── migrations/                       # Token 表结构
└── README.md                         # 配置与运行说明
```

---

## 5. 已完成的关键提交

| 提交 | 说明 |
|------|------|
| `b4a63f2` | Access Token 只存主进程内存；Renderer 不再拿到 Token；Token 失效自动刷新；新增测试 |
| `8b1e725` | 格式化千川 API Client 模块 |
| `d19aad5` | 把直接调用巨量 OpenAPI 的数据流沉淀为规则 |
| `8c79f42` | 客户端直接调用巨量平台 API，不再经过服务端代理 |
| `1c4b282` | 新增计划详情与修改预览骨架 |

---

## 6. 当前阻塞/待完成项

### 6.1 🔴 最优先：计划详情标准化

**问题**：`promotionPlanService.getDetail()` 目前直接返回千川平台原始 Payload：

```ts
// src/main/application/promotion-plan-service.ts
const getDetail = async ({ advertiserId, adId }: PromotionPlanDetailInput) => {
  // ...
  return requestWithAccessTokenRefresh((accessToken) =>
    apiClient.request(url, accessToken, '获取计划详情')
  )
}
```

但 Renderer 的 `PromotionPlanDetailDrawer.tsx` 期望收到：

```ts
{
  ok: true,
  requestId: string,
  snapshot: PromotionPlanDetailSnapshot
}
```

因此当前“查看详情”接口请求成功，但详情抽屉无法展示内容。

**建议下一步**：

1. 在 `src/main/infrastructure/qianchuan-domain.ts` 中新增：
   ```ts
   normalizeProductPlanDetailResponse(
     payload,
     advertiserId,
     fetchedAt,
   ): PromotionPlanDetailResult
   ```
2. 实现 `contentHash`：使用 `crypto.createHash('sha256')`，对业务配置做稳定排序后序列化，不包含 `fetchedAt` / `snapshotId`。
3. 实现 `snapshotId`：`adId + fetchedAt + contentHash 前缀` 或其他主进程可测试生成方式。
4. 把 `getDetail()` 改为返回 `normalizeProductPlanDetailResponse(...)` 的结果。
5. 补测试：真实结构标准化、素材数量聚合、Hash 稳定性、Hash 变更敏感性、`request_id → requestId`、未知字段不进入 Renderer。

### 6.2 🟡 计划真实写操作

- 修改预览 UI（`PromotionPlanEditPreview.tsx`）已存在。
- `promotionPlanFieldChangeSchema`、`promotionPlanEditDraftSchema` 已定义。
- 尚未调用任何巨量写接口，当前保持“只读 + 草稿”状态。
- 接入写接口前必须先重新读取详情并比对 `baseContentHash`。

### 6.3 🟡 监控任务执行

- 监控任务 CRUD、调度器、本地通知已存在。
- 当前监控只做**通知、状态计算和执行记录**，不自动操作真实千川计划。

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

- 13 个测试文件，58 个测试用例全部通过。
- 重点覆盖：
  - OAuth 客户端与 Token 刷新（含 Renderer 不拿到 Token）
  - 计划列表标准化
  - IPC handler 参数校验
  - 监控任务仓库与调度器
  - 计划变更预览逻辑

**详情标准化完成后需补充的测试**：见 6.1。

---

## 9. 重要约束（务必遵守）

- **中文沟通**；JS/TS 优先函数式编程；关键逻辑加详细中文注释。
- Renderer 不得接触 Token、Cookie、`auth_code`、完整请求头。
- 只使用官方 `/open_api/...`，不使用网页 `/ad/api/...`。
- 当前不执行任何真实计划写操作，除非用户明确要求并确认安全方案。
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

1. **先完成 6.1 的详情标准化**，这是当前最显式的缺口。
2. 完成后再跑一次真实只读验证，确认详情抽屉能正常展示。
3. 如果用户确认要写操作，按“读取详情 → 对比 baseContentHash → 调用官方更新接口 → 记录日志”的顺序接入，先做一个字段（如预算）试点。
4. 任何接口字段不确定时，优先查看巨量千川官方开发手册，不要根据网页内部接口反推。

---

*文档由 Codex 于 2026-09-07 根据当前仓库状态生成。*
