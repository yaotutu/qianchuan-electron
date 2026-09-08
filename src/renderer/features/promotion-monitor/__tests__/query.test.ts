import { describe, expect, it } from 'vitest'
import { buildMonitorPlanSelectionInput } from '../query'

describe('监控候选计划查询构造', () => {
  it('只保留监控业务需要的广告主和场景', () => {
    expect(buildMonitorPlanSelectionInput(' 186001 ', ' UNI_PROJECT ')).toEqual({
      advertiserId: '186001',
      scene: 'UNI_PROJECT',
    })
  })

  it('空字符串不会把无效广告主或场景传入 IPC', () => {
    expect(buildMonitorPlanSelectionInput('  ', ' ')).toEqual({
      advertiserId: undefined,
      scene: undefined,
    })
  })
})
