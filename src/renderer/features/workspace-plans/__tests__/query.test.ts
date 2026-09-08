import { describe, expect, it } from 'vitest'
import { buildWorkspacePlanQuery } from '../query'

describe('普通工作台计划查询构造', () => {
  it('固定普通工作台的有效计划、当天和分页口径', () => {
    expect(buildWorkspacePlanQuery(' 186001 ', 'UNI_PROJECT', '2026-09-08')).toEqual({
      advertiserId: '186001',
      keyword: '',
      status: 'ALL',
      scene: 'UNI_PROJECT',
      dateRange: { startDate: '2026-09-08', endDate: '2026-09-08' },
      page: 1,
      pageSize: 100,
    })
  })
})
