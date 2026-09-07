# 千川推广计划写接口能力矩阵（Phase 3）

> 本文只记录巨量千川商业开放平台公开文档中的接口契约，不保存 Cookie、Authorization、Access Token、Refresh Token、`msToken`、`a_bogus`、`verifyFp` 或完整请求头。
>
> 当前阶段只生成“提交准备命令”，不会从 Electron 发起任何真实写请求，也不会修改真实推广计划。

## 已核实的官方接口

| 能力                            | 官方接口                                                           | 权限点                  | 适用范围              | 批量限制                     |
| ------------------------------- | ------------------------------------------------------------------ | ----------------------- | --------------------- | ---------------------------- |
| 更新乘方/全域计划预算           | `POST /open_api/v1.0/qianchuan/uni_promotion/ad/budget/update/`    | 投放管理-PC全域投放管理 | 乘方/全域投放计划     | 单次最多 10 个计划           |
| 更新乘方/全域控成本计划支付 ROI | `POST /open_api/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/` | 投放管理-PC全域投放管理 | 乘方/全域“控成本”计划 | 单次最多 10 条               |
| 编辑全域投放计划                | `POST /open_api/v1.0/qianchuan/uni_aweme/ad/update/`               | 投放管理-PC全域投放管理 | 全量计划配置          | 以官方文档字段和场景限制为准 |

官方文档：

- [更新乘方&全域投放计划预算](https://open.oceanengine.com/labels/12/docs/1841395352172800)
- [更新乘方&全域投放控成本计划支付ROI目标](https://open.oceanengine.com/labels/12/docs/1841394087572811)
- [编辑全域投放计划](https://open.oceanengine.com/labels/12/docs/1804361214022656)
- [获取全域建议预算](https://open.oceanengine.com/labels/12/docs/1828257556490251)
- [权限点与接口关系](https://open.oceanengine.com/labels/12/docs/1699625068225550)

### 预算接口字段白名单

```ts
{
  advertiser_id: number
  update_budget_infos: Array<{
    ad_id: number
    budget: number
    min_estimate_convert?: number
    estimate_convert?: number
    estimate_roi_goal?: number
    min_estimate_roi_goal?: number
  }>
}
```

`budget` 单位为元，最多两位小数。商品全域计划使用建议预算时，为使成本保障生效，四个 `estimate_*` 字段可能条件必填；这些字段必须来自“获取全域建议预算”接口，不能由客户端猜测。当前快照还没有完整保存建议预算上下文，因此本地提交准备层遇到该场景会阻塞。

### ROI 接口字段白名单

```ts
{
  advertiser_id: number
  update_roi2_infos: Array<{
    ad_id: number
    roi2_goal: number
    deep_external_action?: 'AD_CONVERT_TYPE_LIVE_PAY_ROI' | 'AD_CONVERT_TYPE_LIVE_PURE_PAY_ROI'
  }>
}
```

该接口只支持乘方/全域“控成本”计划，`roi2_goal` 最多两位小数。`deep_external_action` 只有在平台快照明确返回对应值时才允许带入，不能在客户端臆造。

## 当前暂不生成正式写命令的字段

- **计划名称**：官方导航中存在“更新商品投放计划名称”，但当前调研尚未确认其准确文档 ID、请求字段、适用场景和名称限制。
- **开始/结束时间**：官方导航中存在“更新乘方&全域投放计划投放时间”，但当前调研尚未确认其准确文档 ID、时间格式和状态限制。
- **计划状态**：更改计划状态属于后续能力，不在本轮首批写入范围内。
- **完整计划配置**：虽然已确认编辑全域计划接口，但它会携带 `delivery_setting`、`creative_setting` 等较大配置对象。首批不使用它承载预算、ROI、名称或时间的增量修改，避免把未修改字段覆盖回平台。

## 安全执行流程（未来真实写入前必须满足）

1. 用户在详情页编辑并查看字段级 Diff。
2. 通过能力矩阵和字段白名单生成提交准备命令；不支持或资料不完整的字段必须阻塞。
3. 用户明确二次确认本次具体变更、广告主、计划和目标值。
4. Electron 主进程从 OAuth 服务端获取短期 Access Token 后，直接调用官方 `/open_api/...`；Refresh Token 始终只在 OAuth 服务端保存和使用。Renderer 不接触任何 Token。
5. 服务端重新读取计划详情，校验广告主归属、计划状态、平台权限和 `baseContentHash`；不一致则拒绝写入。
6. 只发送本次 Diff 对应的官方增量接口；本项目不实现网页内部接口兼容层。
7. 解析批量接口的逐条 `SUCCESS/FAILED` 结果，并返回脱敏的审计结果和 `request_id`。
8. 写入成功后重新读取详情，生成新的快照和内容摘要；失败不得假报成功。

## 待官方文档继续确认

- 名称更新接口的准确路径、长度限制和状态限制；
- 投放时间更新接口的准确路径、时间格式、时区和可修改状态；
- 建议预算接口与成本保障字段的完整关联规则；
- 平台权限不足、计划归属变化和并发修改时的错误码映射。
