import { describe, expect, it } from 'vitest'
import { formatDateRange, formatMetric, formatMoney } from '../format'

describe('千川展示格式化函数', () => {
  it('将金额固定为两位小数', () => {
    expect(formatMoney(12.3)).toBe('¥12.30')
  })

  it('同一年日期范围省略重复年份', () => {
    expect(formatDateRange('2026-09-01', '2026-09-05')).toBe('09/01 至 09/05')
  })

  it('无有效指标时显示占位符', () => {
    expect(formatMetric(0)).toBe('—')
  })
})
