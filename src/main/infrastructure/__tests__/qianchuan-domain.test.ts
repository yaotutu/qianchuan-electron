import { describe, expect, it } from 'vitest'
import { normalizeProductPlanDetailResponse } from '../qianchuan-domain'

const createPayload = (overrides: Record<string, unknown> = {}) => ({
  code: 0,
  message: 'OK',
  request_id: 'request-detail-1',
  data: {
    ad_id: 1875000000000001,
    name: '标准化计划',
    status: 'DELIVERY_OK',
    adlab_scene: 'UNI_PROJECT',
    marketing_goal: 'VIDEO_PROM_GOODS',
    unknown_secret_field: '不得进入快照',
    delivery_setting: {
      budget: '300.50',
      roi2_goal: 2.8,
      budget_mode: 'BUDGET_MODE_DAY',
      deep_external_action: 'AD_CONVERT_TYPE_LIVE_PAY_ROI',
      smart_select_material: true,
      overall_roi_cost_items: [1, '2'],
    },
    product_infos: [{ product_id: '98765432101234567890', channel_type: 'SHOP' }],
    aweme_infos: [{ aweme_uid: 123456789012345, aweme_name: '账号一' }],
    room_info: [{ anchor_id: '9988', anchor_name: '主播一' }],
    creative_setting: { hide_in_aweme: false },
    multi_product_creative_list: [
      {
        product_id: 'p-1',
        video_material: [{ id: 1 }],
        image_material: [{ id: 2 }],
        title_material: [{ title: '标题一' }],
        carousel_material: [{ id: 3 }],
        block_material: [{ id: 4 }],
      },
    ],
    programmatic_creative_media_list: [
      { product_id: 'p-1', video_material: [{ id: 5 }], title_material: [{ title: '标题二' }] },
    ],
    ...overrides,
  },
})

describe('千川计划详情标准化', () => {
  it('裁剪白名单字段、聚合素材并把 ID 转为字符串', () => {
    const result = normalizeProductPlanDetailResponse(createPayload(), '186001', '2026-09-07T12:00:00.000Z')
    expect(result).toMatchObject({ ok: true, requestId: 'request-detail-1' })
    expect(result.snapshot?.identity.adId).toBe('1875000000000001')
    expect(result.snapshot?.products[0]?.productId).toBe('98765432101234567890')
    expect(result.snapshot?.creative).toMatchObject({
      videoCount: 2,
      imageCount: 1,
      titleCount: 2,
      carouselCount: 1,
      blockedMaterialCount: 1,
      selectedStarProductIds: ['p-1'],
    })
    expect(JSON.stringify(result.snapshot)).not.toContain('unknown_secret_field')
    expect(JSON.stringify(result.snapshot)).not.toContain('不得进入快照')
  })

  it('业务内容相同时 Hash 不受 fetchedAt 和对象字段顺序影响', () => {
    const first = normalizeProductPlanDetailResponse(createPayload(), '186001', '2026-09-07T12:00:00.000Z')
    const reordered = createPayload({ name: '标准化计划', ad_id: 1875000000000001 })
    const second = normalizeProductPlanDetailResponse(reordered, '186001', '2026-09-07T12:01:00.000Z')
    expect(first.snapshot?.contentHash).toBe(second.snapshot?.contentHash)
    expect(first.snapshot?.snapshotId).not.toBe(second.snapshot?.snapshotId)
  })

  it('预算或 ROI 变化时更新内容 Hash，并阻止建议预算能力', () => {
    const first = normalizeProductPlanDetailResponse(createPayload(), '186001', '2026-09-07T12:00:00.000Z')
    const changed = normalizeProductPlanDetailResponse(
      createPayload({ delivery_setting: { budget: 500, roi2_goal: 3.1, budget_mode: 'SUGGEST_BUDGET' } }),
      '186001',
      '2026-09-07T12:00:00.000Z',
    )
    expect(changed.snapshot?.contentHash).not.toBe(first.snapshot?.contentHash)
    expect(changed.snapshot?.capabilities.canUpdateBudget).toBe(false)
    expect(changed.snapshot?.capabilities.reasons.join('')).toContain('建议预算')
  })
})
