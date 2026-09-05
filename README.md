# 电小奇 · 千川 Electron 客户端

当前客户端负责桌面登录交互，不直接访问巨量接口。敏感 OAuth 操作由配套的 `qianchuan-oauth-callback` 服务端完成。

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

## 登录流程

1. Electron 主进程请求 `/oauth/oceanengine/start?format=json`；
2. 主进程保存服务端返回的 `attemptId`，并使用系统浏览器打开授权 URL；
3. 巨量回调到服务端后，服务端换 Token 并获取一条 User 信息；
4. 主进程轮询 `/oauth/result?attempt_id=...`；
5. 页面只展示脱敏后的用户信息；登录成功后，自动通过主进程查询商品投放计划。

客户端不使用 `/oauth/latest-result`，因为全局“最近一次结果”可能导致多个授权请求互相串号。该接口仅为旧客户端兼容保留。

## 商品投放计划

登录成功后，工作台会展示当前授权范围内店铺的商品投放计划，支持：

- 按商品或计划名称关键词搜索；
- 按投放状态筛选；
- 在全域计划和乘方计划之间切换；
- 查看消耗、支付 ROI、成交金额、支付订单数和创建时间；
- 分页和手动刷新。

Electron Renderer 不直连巨量接口。筛选参数先由 preload 传给主进程，主进程再调用自有服务端的 `/api/qianchuan/product-plans`；Token 始终只保存在服务端。

## 安全边界

- `nodeIntegration` 关闭；
- `contextIsolation` 开启；
- Renderer 不读取 `.env`；
- Renderer 不接触 App Secret、Access Token、Refresh Token、`auth_code` 或完整授权 URL；
- 配置缺失、旧服务和服务不可用分别由主进程转换为用户可理解的状态，不显示具体环境变量名；
- 登录结果按本次 `attemptId` 隔离。

## 目录

```text
src/
├── main.js       # 主进程、OAuth 服务端请求、系统浏览器、IPC
├── preload.js    # 暴露最小且安全的 OAuth API
├── renderer.js   # 登录交互、状态轮询、用户信息和计划列表展示
├── styles.css    # 登录页和计划工作台样式
└── index.html    # 页面入口
```
