# 千川 Electron 函数式架构规则

> 适用范围：`qianchuan-electron` Electron 客户端及其主进程业务模块。
>
> 目标：在不依赖面向对象继承体系、服务类和隐藏状态的前提下，让后续业务模块可以稳定叠加，避免底层代码频繁返工。

## 1. 总原则：函数式核心，命令式外壳

所有新增业务都优先拆成两部分：

```text
函数式核心（Functional Core）
  纯函数、不可变数据、显式输入输出、可组合规则

命令式外壳（Imperative Shell）
  Electron、IPC、fetch、文件、通知、定时器、日志等副作用
```

业务规则尽量放在函数式核心中，副作用只放在边界适配器中。

```text
Renderer / IPC / HTTP / 文件 / 定时器
              ↓
      应用用例函数（编排）
              ↓
      领域纯函数（计算和决策）
```

不要把业务规则写进 React 组件、fetch 回调、文件仓库或 Electron 生命周期中。

## 2.1 函数式编程范式优先级（强制规则）

本规则作为 JavaScript/TypeScript 业务代码的默认实现优先级：

- 优先使用纯函数、不可变数据、显式输入输出、函数组合、高阶函数、闭包、判别联合和函数记录。
- 查询归一化、平台响应映射、规则计算、状态转换、变更预览、写入前置校验、错误分类和格式化等逻辑，应优先写成可独立测试的纯函数。
- 网络、文件、Electron API、IPC、通知、定时器、当前时间和随机数等副作用，必须收口在边界，或通过显式函数参数注入。
- 新增业务默认不使用 `class`、继承、通过 `this` 保存可变业务状态、全局单例和万能 `Service` / `Manager`。若确有必要，必须在评审记录中说明无法采用函数式实现的具体原因。
- 对已有模块采取渐进式迁移：不为迁移而破坏既有协议，按最小垂直切片逐步替换隐藏依赖和可变状态。

## 2. 禁止用面向对象方式组织业务

### 2.1 默认禁止

新代码默认不使用：

- `class` 组织业务服务；
- `extends`、继承层次和模板方法；
- 通过 `this` 保存可变业务状态；
- 全局单例服务；
- 依赖容器和隐式服务定位；
- “万能 Service”或“万能 Manager”；
- 为了抽象而创建空接口、基类或抽象类。

现有代码中的工厂函数可以继续使用，但工厂函数必须返回函数或函数记录，不应返回带有隐式生命周期的面向对象实例。

### 2.2 推荐写法

优先使用：

- 命名函数；
- 高阶函数；
- 闭包；
- 纯数据结构；
- 判别联合；
- 函数记录（record of functions）；
- 显式组合根。

```ts
export type ListPromotionPlans = (query: PromotionPlanListQuery) => Promise<Result<PromotionPlanPage>>

export type PromotionPlanGateway = {
  list: ListPromotionPlans
  getDetail: GetPromotionPlanDetail
}
```

这里的 `PromotionPlanGateway` 只是函数集合，不是类、对象继承或运行时服务定位器。

## 3. 依赖隔离使用“函数参数”，不使用面向对象依赖注入

依赖隔离不是面向对象专属概念。在本项目中，依赖隔离统一使用：

1. 函数类型；
2. 函数记录；
3. 工厂函数的显式参数；
4. 组合根集中组装。

示例：

```ts
type PromotionPlanUseCaseDeps = {
  listPlans: (query: PromotionPlanListQuery) => Promise<Result<PromotionPlanPage>>
  getDetail: (input: PromotionPlanDetailQuery) => Promise<Result<PromotionPlanSnapshot>>
  now: () => Date
}

export const createPromotionPlanUseCases = (deps: PromotionPlanUseCaseDeps) => {
  const list = async (query: PromotionPlanListQuery) => {
    const normalizedQuery = normalizePromotionPlanQuery(query)
    return deps.listPlans(normalizedQuery)
  }

  return { list }
}
```

业务模块只看到 `deps.listPlans` 这种能力函数，不知道它来自 fetch、Mock、缓存还是未来的数据库。

禁止在业务函数内部直接调用：

```ts
fetch(...)
fs.readFile(...)
new Date()
randomUUID()
setInterval(...)
Notification(...)
```

这些能力必须通过参数传入，或者只存在于 Infrastructure 适配器中。

## 4. 组合根负责组装，业务模块不负责寻找依赖

依赖只在组合根创建和连接：

```text
src/main.ts
  创建 OAuth Client
  创建千川 Gateway
  创建任务仓库
  创建通知函数
  创建应用用例
  创建 IPC Handler
```

业务模块不得：

- 自己读取环境变量；
- 自己创建 fetch 客户端；
- 自己读取 Electron `app.getPath`；
- 自己从全局变量获取 Token；
- 自己 import 具体的文件仓库；
- 自己注册 IPC 或定时器。

这样可以让同一个用例在测试、开发和生产环境中使用不同的能力函数。

## 5. 数据优先：使用不可变的普通数据

业务状态优先使用普通对象、数组、Map 的不可变副本和判别联合，不使用可变实例。

推荐：

```ts
const updatedTask = {
  ...task,
  status: 'PAUSED' as const,
  updatedAt,
}

const nextTasks = tasks.map((item) => (item.id === taskId ? updatedTask : item))
```

避免：

```ts
// 不推荐：通过方法改变内部状态，调用方无法知道副作用范围
class Task {
  pause() {
    this.status = 'PAUSED'
  }
}
```

业务函数应返回新的状态或新的结果，不要偷偷修改传入对象。

## 6. 纯函数规则

可以成为纯函数的逻辑必须写成纯函数：

- 查询参数标准化；
- 平台响应映射；
- 规则计算；
- 计划变更预览；
- 写入前置校验；
- 分页计算；
- 状态转换；
- 错误分类；
- 日期和金额格式化。

纯函数应满足：

```text
相同输入 → 相同输出
不读全局可变状态
不写文件、不发请求、不弹通知
不修改输入参数
```

时间、随机数和环境信息不是纯函数的隐式来源，必须显式传入：

```ts
export const isDue = (task: MonitorTask, now: Date): boolean => {
  // 根据显式时间计算，不直接调用 new Date()
}
```

## 7. 副作用集中在边界适配器

以下能力只能出现在边界模块：

- `fetch`、HTTP 请求；
- `fs` 文件读写；
- Electron `app`、`BrowserWindow`、`Notification`；
- `ipcMain`、`ipcRenderer`；
- `setInterval`、`setTimeout`；
- 日志输出；
- 系统浏览器和外部链接。

边界适配器负责把外部世界转换成内部数据：

```text
外部输入
  → Zod 解析
  → 平台/文件 DTO
  → 应用模型
  → 纯函数业务逻辑
```

纯业务函数不应接收 `Response`、`Request`、`IpcMainInvokeEvent`、Electron 对象或平台原始大对象。

## 8. 用 `Result` 表达预期失败，不用异常驱动业务流程

用户可预期的失败应返回判别联合：

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

适合返回 `Result` 的情况：

- 参数不合法；
- 未授权；
- 无广告主权限；
- 平台限流；
- 平台业务拒绝；
- 计划版本冲突；
- 本地数据不存在；
- 用户取消操作。

异常只用于：

- 程序员错误；
- 配置无法启动；
- 不可恢复的基础设施故障；
- 没有能力安全转换的未知错误。

在 IPC 边界必须把未知异常转换为安全的应用错误，不能把内部堆栈传给 Renderer。

## 9. 用状态转换函数表达业务流程

复杂流程优先表示为明确的状态和事件，而不是在多个异步回调中修改变量。

```ts
type MonitorRunState =
  | { status: 'IDLE' }
  | { status: 'RUNNING'; runId: string; startedAt: string }
  | { status: 'SUCCEEDED'; runId: string; finishedAt: string }
  | { status: 'FAILED'; runId: string; message: string }

const transitionMonitorRun = (state: MonitorRunState, event: MonitorRunEvent): MonitorRunState => {
  // 纯函数：只根据旧状态和事件计算新状态
}
```

定时器或 IPC 只负责产生事件，状态转换和业务决策放在纯函数中。

## 10. 查询、命令和副作用分离

每个业务模块至少区分三类函数：

```text
Query       只读数据，不修改本地状态
Command     产生业务变更意图，经过校验后才执行
Effect      执行 HTTP、文件、通知等副作用
```

例如推广计划修改：

```text
buildPlanChangePreview       纯函数
validatePlanChange           纯函数
buildPlatformUpdateCommand   纯函数
executePlatformCommand       副作用函数
readLatestPlanDetail         查询函数
```

Renderer 只能提交业务草稿和用户确认，不得提交平台 endpoint、任意平台 payload 或 Access Token。

## 11. 平台适配器只做映射，不承载业务决策

千川 Infrastructure 适配器只负责：

- 组装官方请求；
- 传递 Access Token；
- 解析平台响应；
- 将平台错误映射成应用错误；
- 将平台模型转换成应用模型。

它不负责：

- 判断页面该显示什么；
- 决定用户是否确认；
- 决定监控规则是否触发；
- 修改本地任务状态；
- 直接向 Renderer 发送消息。

平台字段不能泄漏到 Renderer。需要展示的平台字段必须先转换成稳定的应用 DTO。

## 12. IPC 和 Renderer 规则

### 12.1 IPC 是协议，不是函数直通

每个 IPC 方法必须有：

- 明确输入 Schema；
- 明确输出 Schema；
- 稳定错误码；
- 对应的主进程用例；
- 对应的 preload 方法；
- Renderer 侧 API 适配；
- 契约测试。

Preload 不暴露完整 `ipcRenderer`，Renderer 不知道 channel 名称，也不能自由调用未知方法。

### 12.2 Renderer 不复制服务端状态

TanStack Query 管理平台数据和本地任务数据；Zustand 只管理纯 UI 状态，例如：

- 当前广告主；
- 当前筛选条件；
- 选中的 ID；
- 页面显示偏好。

不要把同一份计划或任务同时放进 Query Cache 和 Zustand。

## 13. 测试规则

优先测试函数式核心：

- 规则计算；
- 状态转换；
- 查询参数；
- 平台响应映射；
- 写入前置校验；
- 错误映射。

这些测试不需要 Electron、真实网络或临时文件。

副作用适配器只测试边界行为：

- 请求 URL、方法和必要 Header；
- 超时和网络错误；
- 文件不存在、损坏和原子写入；
- IPC 参数校验和安全错误转换。

不要用端到端测试覆盖所有纯业务规则，也不要为了测试给生产代码增加隐藏的全局开关。

## 14. 抽象时机规则

只有满足以下条件之一才抽象：

- 同一业务规则已经在两个真实模块中重复；
- 两个实现需要被同一个用例替换；
- 现有代码已经出现明确的变化轴；
- 抽象能减少外部依赖，而不是增加类型层级。

不要提前创建：

- `BaseService`；
- `AbstractRepository`；
- `IManager`；
- 包含十几个方法的万能 Gateway；
- 为未来可能的平台设计的超大通用模型。

优先抽象最小能力函数：

```ts
type ReadPromotionPlanDetail = (input: PromotionPlanDetailQuery) => Promise<Result<PromotionPlanSnapshot>>
```

而不是先创建一个包含列表、详情、写入、报表、导出的万能接口。

## 15. 代码审查清单

新增或修改业务模块时，检查：

- [ ] 是否优先使用纯函数和不可变数据？
- [ ] 是否新增了 `class`、继承或隐藏可变状态？如有，是否有充分理由？
- [ ] 是否把 `fetch`、文件、Electron、时间、随机数作为显式依赖？
- [ ] Application 是否只依赖函数或函数记录，而不是 Infrastructure 具体实现？
- [ ] 是否把平台字段泄漏到了 Renderer 或 Shared Contract？
- [ ] 是否用 `Result` 表达了预期失败？
- [ ] 是否把查询、命令和副作用拆开？
- [ ] 是否在 IPC 边界做了输入和输出校验？
- [ ] 是否避免了全局单例和隐式缓存？
- [ ] 是否为纯业务规则补充了不依赖 Electron 的单元测试？
- [ ] 是否只做了当前真实需求需要的最小抽象？

## 16. 一句话标准

> **用纯函数描述“应该发生什么”，用显式传入的函数描述“需要什么能力”，把真正的副作用收口在边界，把所有状态变化表示成新的数据。**
