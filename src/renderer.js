/**
 * Renderer 只负责交互和展示，不直接访问网络或 Node.js。
 * 所有 OAuth 与商品计划查询都通过 preload 暴露的最小接口进入主进程。
 */
const elements = {
  loginCard: document.querySelector('#loginCard'),
  workspace: document.querySelector('#workspace'),
  serviceStatus: document.querySelector('#serviceStatus'),
  serviceStatusText: document.querySelector('#serviceStatusText'),
  authBadge: document.querySelector('#authBadge'),
  stateView: document.querySelector('#stateView'),
  stateIcon: document.querySelector('#stateIcon'),
  stateTitle: document.querySelector('#stateTitle'),
  stateMessage: document.querySelector('#stateMessage'),
  errorCode: document.querySelector('#errorCode'),
  userCard: document.querySelector('#userCard'),
  avatar: document.querySelector('#avatar'),
  userName: document.querySelector('#userName'),
  userId: document.querySelector('#userId'),
  userEmail: document.querySelector('#userEmail'),
  userAppId: document.querySelector('#userAppId'),
  scopeCount: document.querySelector('#scopeCount'),
  tokenExpiresAt: document.querySelector('#tokenExpiresAt'),
  loginButton: document.querySelector('#loginButton'),
  reauthorizeButton: document.querySelector('#reauthorizeButton'),
  sidebarReauthorizeButton: document.querySelector('#sidebarReauthorizeButton'),
  miniAvatar: document.querySelector('#miniAvatar'),
  miniUserName: document.querySelector('#miniUserName'),
  planFilters: document.querySelector('#planFilters'),
  advertiserSelect: document.querySelector('#advertiserSelect'),
  keywordInput: document.querySelector('#keywordInput'),
  statusSelect: document.querySelector('#statusSelect'),
  sceneSelect: document.querySelector('#sceneSelect'),
  refreshPlansButton: document.querySelector('#refreshPlansButton'),
  currentAdvertiser: document.querySelector('#currentAdvertiser'),
  planTotal: document.querySelector('#planTotal'),
  queryRange: document.querySelector('#queryRange'),
  lastSyncedAt: document.querySelector('#lastSyncedAt'),
  plansError: document.querySelector('#plansError'),
  plansTableBody: document.querySelector('#plansTableBody'),
  plansEmpty: document.querySelector('#plansEmpty'),
  planLoadingText: document.querySelector('#planLoadingText'),
  paginationSummary: document.querySelector('#paginationSummary'),
  paginationPage: document.querySelector('#paginationPage'),
  previousPageButton: document.querySelector('#previousPageButton'),
  nextPageButton: document.querySelector('#nextPageButton')
}

const POLL_INTERVAL_MS = 2_000
const LOGIN_TIMEOUT_MS = 10 * 60 * 1_000
let pollTimer = null
let loginStartedAt = null
let buttonAction = 'login'
let currentPage = 1
let totalPages = 1

const STATUS_LABELS = Object.freeze({
  ALL: '全部',
  DELIVERY_OK: '投放中',
  DISABLE: '已暂停',
  AUDIT: '审核中',
  TIME_DONE: '已完成',
  OFFLINE_BUDGET: '预算不足',
  ALL_INCLUDE_DELETED: '包含已删除',
  FROZEN: '已终止',
  OFFLINE_BALANCE: '余额不足',
  SYSTEM_DISABLE: '系统暂停',
  NO_SCHEDULE: '不在投放时段',
  REAUDIT: '修改审核中',
  DELETED: '已删除'
})

const setText = (element, value) => {
  element.textContent = value
}

/** 兼容巨量常见的 `YYYY-MM-DD HH:mm:ss` 日期格式，并按本地时间展示。 */
const formatDateTime = (value) => {
  const normalizedValue = typeof value === 'string' ? value.replace(' ', 'T') : value
  const date = new Date(normalizedValue)
  if (!value || Number.isNaN(date.getTime())) return '平台未返回'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const formatMoney = (value) => `¥${Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`

const formatMetric = (value, suffix = '') => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
    ? `${number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`
    : '—'
}

const stopPolling = () => {
  if (pollTimer) window.clearTimeout(pollTimer)
  pollTimer = null
}

const renderService = (state, text) => {
  elements.serviceStatus.dataset.state = state
  setText(elements.serviceStatusText, text)
}

const renderState = ({
  badge,
  state,
  icon,
  title,
  message,
  buttonText,
  errorCode = '',
  busy = false,
  action = 'login'
}) => {
  elements.authBadge.dataset.state = state
  setText(elements.authBadge, badge)
  elements.stateView.dataset.hidden = 'false'
  elements.userCard.dataset.visible = 'false'
  elements.stateIcon.replaceChildren()

  if (busy) {
    const spinner = document.createElement('span')
    spinner.className = 'spinner'
    elements.stateIcon.append(spinner)
  } else {
    setText(elements.stateIcon, icon)
  }

  setText(elements.stateTitle, title)
  setText(elements.stateMessage, message)
  setText(elements.errorCode, errorCode)
  setText(elements.loginButton, buttonText)
  elements.loginButton.disabled = busy
  buttonAction = action
}

const showWorkspace = () => {
  elements.loginCard.hidden = true
  elements.workspace.hidden = false
  elements.reauthorizeButton.hidden = false
}

const showLogin = () => {
  elements.loginCard.hidden = false
  elements.workspace.hidden = true
  elements.reauthorizeButton.hidden = true
}

/**
 * OAuth 结果只包含广告主 ID，不含店铺名称，因此先以 ID 作为选择项。
 * 服务端仍会二次校验该 ID 是否属于当前授权，不能通过页面伪造越权查询。
 */
const renderAdvertiserOptions = (advertiserIds = []) => {
  const normalizedIds = [...new Set(advertiserIds.map(String).filter(Boolean))]
  const options = normalizedIds.map((advertiserId, index) => {
    const option = document.createElement('option')
    option.value = advertiserId
    option.textContent = `店铺 ${advertiserId}`
    option.selected = index === 0
    return option
  })

  elements.advertiserSelect.replaceChildren(...options)
  if (!options.length) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = '未返回授权店铺'
    elements.advertiserSelect.append(option)
  }
  elements.advertiserSelect.disabled = normalizedIds.length <= 1
}

const renderUser = (result) => {
  const user = result.user || {}
  const token = result.token || {}
  const displayName = user.displayName || '千川用户'

  elements.authBadge.dataset.state = 'success'
  setText(elements.authBadge, '已登录')
  elements.stateView.dataset.hidden = 'true'
  elements.userCard.dataset.visible = 'true'
  setText(elements.avatar, displayName.slice(0, 1))
  setText(elements.userName, displayName)
  setText(elements.userId, `用户 ID：${user.id || '未返回'}`)
  setText(elements.userEmail, user.email || '未返回')
  setText(elements.userAppId, String(user.appId || '未返回'))
  setText(elements.scopeCount, `${user.scopeCount || 0} 项`)
  setText(elements.tokenExpiresAt, formatDateTime(token.accessTokenExpiresAt))
  setText(elements.miniAvatar, displayName.slice(0, 1))
  setText(elements.miniUserName, displayName)
  setText(elements.loginButton, '重新授权')
  elements.loginButton.disabled = false
  buttonAction = 'login'

  renderAdvertiserOptions(Array.isArray(token.advertiserIds) ? token.advertiserIds : [])
  showWorkspace()
  void loadPlans({ page: 1 })
}

const renderLoggedOut = () => {
  showLogin()
  renderState({
    badge: '未登录',
    state: 'idle',
    icon: '↗',
    title: '准备开始',
    message: '点击登录后，将在系统浏览器中打开巨量官方授权页面。',
    buttonText: '使用巨量千川登录'
  })
}

const renderCurrentAuthorization = (result) => {
  if (result?.ok && result.status === 'success') return renderUser(result)
  if (result?.ok && result.status === 'idle') return renderLoggedOut()

  if (result?.status === 'reauthorization_required') {
    showLogin()
    return renderState({
      badge: '授权已失效',
      state: 'error',
      icon: '!',
      title: '需要重新登录',
      message: result.message || '长期授权已失效，请重新完成一次巨量授权。',
      errorCode: '错误码：REAUTHORIZATION_REQUIRED',
      buttonText: '重新登录'
    })
  }

  if (result?.status === 'token_refresh_failed') {
    showLogin()
    return renderState({
      badge: '续期失败',
      state: 'error',
      icon: '!',
      title: '暂时无法恢复登录',
      message: result.message || '服务端暂时无法刷新授权，请稍后重新检测。',
      errorCode: '错误码：TOKEN_REFRESH_FAILED',
      buttonText: '重新检测',
      action: 'retry'
    })
  }

  return renderUnavailable(result)
}

const renderUnavailable = (result) => {
  showLogin()
  const isOutdated = result?.status === 'server_outdated'
  renderService('offline', isOutdated ? '登录服务需要重启' : '登录服务不可用')
  renderState({
    badge: '暂不可用',
    state: 'error',
    icon: '!',
    title: isOutdated ? '登录服务版本未更新' : '暂时无法连接登录服务',
    message: result?.message || '请确认登录服务已经启动，然后重新检测。',
    errorCode: isOutdated ? '错误码：SERVER_OUTDATED' : '错误码：SERVER_UNAVAILABLE',
    buttonText: '重新检测',
    action: 'retry'
  })
}

const renderResult = (result) => {
  if (result?.ok && result.status === 'success') {
    stopPolling()
    loginStartedAt = null
    renderUser(result)
    return
  }
  if (result?.status === 'waiting' || result?.status === 'idle') return
  if (!result?.ok) {
    stopPolling()
    loginStartedAt = null
    renderState({
      badge: '未完成',
      state: 'error',
      icon: '!',
      title: '本次登录没有完成',
      message: result?.message || result?.errorDescription || '请重新发起登录。',
      buttonText: '重新登录'
    })
  }
}

const pollLoginResult = async () => {
  if (!loginStartedAt) return
  if (Date.now() - loginStartedAt > LOGIN_TIMEOUT_MS) {
    stopPolling()
    loginStartedAt = null
    renderState({
      badge: '已超时',
      state: 'error',
      icon: '!',
      title: '等待授权超时',
      message: '本次授权已超过十分钟，请重新登录。',
      buttonText: '重新登录'
    })
    return
  }

  const result = await window.qianchuan.oauth.getStatus()
  renderResult(result)
  if (loginStartedAt) pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS)
}

const startLogin = async () => {
  stopPolling()
  showLogin()
  renderState({
    badge: '正在打开',
    state: 'waiting',
    icon: '',
    title: '正在打开授权页面',
    message: '即将在系统浏览器中打开巨量官方授权页面。',
    buttonText: '正在打开…',
    busy: true
  })

  const result = await window.qianchuan.oauth.startLogin()
  if (!result?.ok) {
    const unavailableStatuses = ['server_unavailable', 'not_configured', 'error']
    return unavailableStatuses.includes(result?.status)
      ? renderUnavailable(result)
      : renderResult(result || { ok: false, message: '无法发起登录。' })
  }

  loginStartedAt = result.startedAt ? Date.parse(result.startedAt) : Date.now()
  if (Number.isNaN(loginStartedAt)) loginStartedAt = Date.now()
  renderState({
    badge: '等待授权',
    state: 'waiting',
    icon: '↗',
    title: '请在浏览器中完成授权',
    message: '授权成功后可以关闭浏览器，本页面会自动更新。',
    buttonText: '重新打开授权'
  })
  pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS)
}

const createImagePlaceholder = () => {
  const placeholder = document.createElement('span')
  placeholder.className = 'product-image is-empty'
  placeholder.textContent = '图'
  return placeholder
}

const renderPlanProduct = (plan) => {
  const product = plan.products?.[0] || {}
  const wrapper = document.createElement('div')
  wrapper.className = 'plan-main'

  if (product.image) {
    const image = document.createElement('img')
    image.className = 'product-image'
    image.src = product.image
    image.alt = product.name || '商品预览图'
    image.loading = 'lazy'
    image.addEventListener('error', () => image.replaceWith(createImagePlaceholder()), { once: true })
    wrapper.append(image)
  } else {
    wrapper.append(createImagePlaceholder())
  }

  const copy = document.createElement('div')
  copy.className = 'plan-copy'
  const name = document.createElement('strong')
  name.textContent = plan.name || '未命名计划'
  const meta = document.createElement('span')
  meta.textContent = `ID ${plan.id || '—'} · ${product.name || '未绑定商品'}`
  copy.append(name, meta)
  wrapper.append(copy)
  return wrapper
}

const renderStatus = (plan) => {
  const status = document.createElement('span')
  status.className = `status-pill status-${String(plan.status || '').toLowerCase()}`
  status.textContent = STATUS_LABELS[plan.status] || plan.status || '未知'
  return status
}

const renderType = (plan) => {
  const type = document.createElement('span')
  type.className = 'type-text'
  type.textContent = plan.scene === 'OVERALL_PROJECT' ? '乘方计划' : '全域计划'
  return type
}

const appendCell = (row, content) => {
  const cell = document.createElement('td')
  if (content instanceof Node) cell.append(content)
  else cell.textContent = content
  row.append(cell)
}

const renderPlanRow = (plan) => {
  const row = document.createElement('tr')
  const cells = [
    renderPlanProduct(plan),
    renderStatus(plan),
    renderType(plan),
    formatMoney(plan.metrics?.costYuan),
    formatMetric(plan.metrics?.payRoi),
    formatMoney(plan.metrics?.payGmvYuan),
    formatMetric(plan.metrics?.payOrderCount, ' 单'),
    formatDateTime(plan.createTime)
  ]
  cells.forEach((content) => appendCell(row, content))
  return row
}

const renderPlans = (result) => {
  const plans = Array.isArray(result?.plans) ? result.plans : []
  elements.plansTableBody.replaceChildren(...plans.map(renderPlanRow))
  elements.plansEmpty.hidden = plans.length > 0
  setText(elements.planTotal, Number(result?.page?.total || 0).toLocaleString('zh-CN'))
  setText(elements.currentAdvertiser, result?.advertiserId || '—')
  setText(elements.queryRange, `${result?.query?.startDate || '—'} 至 ${result?.query?.endDate || '—'}`)

  currentPage = Number(result?.page?.current || 1)
  totalPages = Math.max(1, Number(result?.page?.totalPages || 1))
  setText(elements.paginationPage, `${currentPage} / ${totalPages}`)
  setText(
    elements.paginationSummary,
    plans.length
      ? `本页 ${plans.length} 条，共 ${result?.page?.total || plans.length} 条`
      : '没有符合条件的计划'
  )
  elements.previousPageButton.disabled = currentPage <= 1
  elements.nextPageButton.disabled = currentPage >= totalPages
}

const renderPlansError = (result) => {
  const message = result?.status === 'reauthorization_required'
    ? '授权已失效，请重新登录后再查看计划。'
    : (result?.message || '获取投放计划失败，请稍后重试。')
  elements.plansError.hidden = false
  setText(elements.plansError, message)

  if (result?.status === 'reauthorization_required') {
    showLogin()
    renderState({
      badge: '授权已失效',
      state: 'error',
      icon: '!',
      title: '需要重新登录',
      message,
      buttonText: '重新登录'
    })
  }
}

/** 收集白名单筛选项；空广告主 ID 会由服务端安全地选择授权列表中的第一个。 */
const getPlanFilters = (page) => ({
  advertiser_id: elements.advertiserSelect.value,
  keyword: elements.keywordInput.value.trim(),
  status: elements.statusSelect.value,
  scene: elements.sceneSelect.value,
  page,
  page_size: 20
})

const setPlansLoading = (loading) => {
  elements.refreshPlansButton.disabled = loading
  elements.planFilters.querySelectorAll('button, input, select').forEach((element) => {
    element.disabled = loading || (element === elements.advertiserSelect && element.options.length <= 1)
  })
}

const loadPlans = async (overrides = {}) => {
  elements.plansError.hidden = true
  setText(elements.planLoadingText, '正在同步…')
  setPlansLoading(true)

  try {
    const result = await window.qianchuan.plans.list(getPlanFilters(overrides.page || currentPage))
    if (!result?.ok) return renderPlansError(result)
    const syncedAt = new Date().toISOString()
    setText(elements.lastSyncedAt, formatDateTime(syncedAt))
    setText(elements.planLoadingText, `更新于 ${formatDateTime(syncedAt)}`)
    renderPlans(result)
  } catch (error) {
    renderPlansError({ message: error?.message || '获取投放计划失败，请稍后重试。' })
    setText(elements.planLoadingText, '同步失败')
  } finally {
    setPlansLoading(false)
  }
}

const initialize = async () => {
  stopPolling()
  renderService('checking', '正在检测登录服务')
  renderState({
    badge: '检测中',
    state: 'idle',
    icon: '',
    title: '正在连接登录服务',
    message: '请稍候。',
    buttonText: '检测中…',
    busy: true
  })

  if (!window.qianchuan?.oauth || !window.qianchuan?.plans) {
    return renderUnavailable({ status: 'error', message: '客户端安全接口初始化失败，请重启应用。' })
  }

  try {
    const health = await window.qianchuan.oauth.getHealth()
    if (!health?.ok) return renderUnavailable(health)
    renderService('online', '登录服务正常')
    return renderCurrentAuthorization(await window.qianchuan.oauth.getCurrent())
  } catch (error) {
    return renderUnavailable({ status: 'error', message: error?.message || '无法连接登录服务。' })
  }
}

elements.loginButton.addEventListener('click', () => {
  if (buttonAction === 'retry') void initialize()
  else void startLogin()
})
elements.reauthorizeButton.addEventListener('click', () => void startLogin())
elements.sidebarReauthorizeButton.addEventListener('click', () => void startLogin())
elements.planFilters.addEventListener('submit', (event) => {
  event.preventDefault()
  void loadPlans({ page: 1 })
})
elements.advertiserSelect.addEventListener('change', () => void loadPlans({ page: 1 }))
elements.refreshPlansButton.addEventListener('click', () => void loadPlans())
elements.previousPageButton.addEventListener('click', () => void loadPlans({ page: Math.max(1, currentPage - 1) }))
elements.nextPageButton.addEventListener('click', () => void loadPlans({ page: Math.min(totalPages, currentPage + 1) }))
window.addEventListener('beforeunload', stopPolling)

void initialize()
