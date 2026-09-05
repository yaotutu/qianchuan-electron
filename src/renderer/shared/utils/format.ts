/** 将平台可能返回的日期格式统一交给原生 Intl，避免把平台字段直接渲染成异常文本。 */
export const formatDateTime = (value?: string) => {
  if (!value) return '平台未返回'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return '平台未返回'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export const formatDateRange = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return '—'
  const startParts = startDate.split('-')
  const endParts = endDate.split('-')
  if (startParts.length !== 3 || endParts.length !== 3) return '—'
  return startParts[0] === endParts[0]
    ? `${startParts[1]}/${startParts[2]} 至 ${endParts[1]}/${endParts[2]}`
    : `${startDate} 至 ${endDate}`
}

export const formatMoney = (value?: number | string) =>
  `¥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export const formatMetric = (value?: number | string, suffix = '') => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
    ? `${number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`
    : '—'
}
