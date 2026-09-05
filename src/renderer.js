/**
 * Renderer 只负责页面状态、交互和安全展示，不直接访问网络或 Node.js。
 * OAuth 与商品计划查询全部通过 preload 暴露的最小接口进入 Electron 主进程。
 */

/** 页面结构变更时尽早抛错，避免空节点问题被拖到某一次点击后才暴露。 */
const getElement = (id) => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`页面缺少必要节点：#${id}`)
  return element
}

const elements = Object.freeze({
  loginCard: getElement('loginCard'),
  workspace: getElement('workspace'),
  serviceStatus: getElement('serviceStatus'),
  serviceStatusText: getElement('serviceStatusText'),
  authBadge: getElement('authBadge'),
  stateView: getElement('stateView'),
  stateIcon: getElement('stateIcon'),
  stateTitle: getElement('stateTitle'),
  stateMessage: getElement('stateMessage'),
  errorCode: getElement('errorCode'),
  userCard: getElement('userCard'),
  avatar: getElement('avatar'),
  userName: getElement('userName'),
  userId: getElement('userId'),
  userEmail: getElement('userEmail'),
  userAppId: getElement('userAppId'),
  scopeCount: getElement('scopeCount'),
  tokenExpiresAt: getElement('tokenExpiresAt'),
  loginButton: getElement('loginButton'),
  reauthorizeButton: getElement('reauthorizeButton'),
  sidebarReauthorizeButton: getElement('sidebarReauthorizeButton'),
  miniAvatar: getElement('miniAvatar'),
  miniUserName: getElement('miniUserName'),
  planFilters: getElement('planFilters'),
  advertiserSelect: getElement('advertiserSelect'),
  keywordInput: getElement('keywordInput'),
  statusSelect: getElement('statusSelect'),
  sceneSelect: getElement('sceneSelect'),
  resetFiltersButton: getElement('resetFiltersButton'),
  refreshPlansButton: getElement('refreshPlansButton'),
  currentAdvertiser: getElement('currentAdvertiser'),
  currentAdvertiserMeta: getElement('currentAdvertiserMeta'),
  planTotal: getElement('planTotal'),
  queryRange: getElement('queryRange'),
  lastSyncedAt: getElement('lastSyncedAt'),
  plansError: getElement('plansError'),
  plansTableBody: getElement('plansTableBody'),
  plansEmpty: getElement('plansEmpty'),
  planLoadingText: getElement('planLoadingText'),
  paginationSummary: getElement('paginationSummary'),
  paginationPage: getElement('paginationPage'),
  previousPageButton: getElement('previousPageButton'),
  nextPageButton: getElement('nextPageButton')
})

const POLL_INTERVAL_MS = 2_000
const LOGIN_TIMEOUT_MS = 10 * 60 * 1_000
const PLAN_PAGE_SIZE = 20

/**
 * 可变运行状态集中存放，避免在 Renderer 顶层散落多个互相依赖的变量。
 * advertisersById 只保存服务端已经授权并发现的广告主展示信息。
 */
const runtime = {
  pollTimer: null,
  loginStartedAt: null,
  buttonAction: 'login',
  currentPage: 1,
  totalPages: 1,
  planRequestId: 0,
  advertisersById: new Map()
}

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
  element.textContent = String(value ?? '')
}

/** 创建只包含可信文本的页面节点，避免业务数据被解释为 HTML。 */
const createTextElement = (tagName, className, text) => {
  const element = document.createElement(tagName)
  if (className) element.className = className
  setText(element, text)
  return element
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

/** 概览卡使用紧凑日期，完整查询范围仍保留在 title 中供悬停查看。 */
const formatDateRange = (startDate, endDate) => {
  const startParts = String(startDate || '').split('-')
  const endParts = String(endDate || '').split('-')
  if (startParts.length !== 3 || endParts.length !== 3) return '—'

  const [startYear, startMonth, startDay] = startParts
  const [endYear, endMonth, endDay] = endParts
  return startYear === endYear
    ? `${startMonth}/${startDay} 至 ${endMonth}/${endDay}`
    : `${startYear}/${startMonth}/${startDay} 至 ${endYear}/${endMonth}/${endDay}`
}

const formatMetric = (value, suffix = '') => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
    ? `${number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`
    : '—'
}

const stopPolling = () => {
  if (runtime.pollTimer) window.clearTimeout(runtime.pollTimer)
  runtime.pollTimer = null
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
    elements.stateIcon.append(createTextElement('span', 'spinner', ''))
  } else {
    setText(elements.stateIcon, icon)
  }

  setText(elements.stateTitle, title)
  setText(elements.stateMessage, message)
  setText(elements.errorCode, errorCode)
  setText(elements.loginButton, buttonText)
  elements.loginButton.disabled = busy
  runtime.buttonAction = action
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
 * 使用服务端发现的真实千川广告主渲染店铺选择器。
 * 页面只负责展示；服务端仍会校验传入 ID 是否属于当前授权，不能通过 DOM 伪造越权查询。
 */
const renderAdvertiserOptions = (advertiserIds = [], advertiserAccounts = []) => {
  runtime.advertisersById = new Map(
    advertiserAccounts
      .filter((account) => account?.advertiserId)
      .map((account) => [String(account.advertiserId), account])
  )

  const normalizedIds = [...new Set(advertiserIds.map(String).filter(Boolean))]
  const options = normalizedIds.map((advertiserId, index) => {
    const account = runtime.advertisersById.get(advertiserId)
    const name = account?.advertiserName || account?.shopName
    const option = createTextElement(
      'option',
      '',
      name ? `${name}（${advertiserId}）` : `店铺 ${advertiserId}`
    )
    option.value = advertiserId
    option.selected = index === 0
    return option
  })

  elements.advertiserSelect.replaceChildren(...options)
  if (!options.length) {
    const option = createTextElement('option', '', '未返回授权店铺')
    option.value = ''
    elements.advertiserSelect.append(option)
  }
  elements.advertiserSelect.disabled = normalizedIds.length <= 1
}

const renderUser = (result) => {
  const user = result.user || {}
  const token = result.token || {}
  const displayName = user.displayName || '千川用户'
  const avatarText = displayName.slice(0, 1)

  elements.authBadge.dataset.state = 'success'
  setText(elements.authBadge, '已登录')
  elements.stateView.dataset.hidden = 'true'
  elements.userCard.dataset.visible = 'true'
  setText(elements.avatar, avatarText)
  setText(elements.userName, displayName)
  setText(elements.userId, `用户 ID：${user.id || '未返回'}`)
  setText(elements.userEmail, user.email || '未返回')
  setText(elements.userAppId, String(user.appId || '未返回'))
  setText(elements.scopeCount, `${user.scopeCount || 0} 项`)
  setText(elements.tokenExpiresAt, formatDateTime(token.accessTokenExpiresAt))
  setText(elements.miniAvatar, avatarText)
  setText(elements.miniUserName, displayName)
  setText(elements.loginButton, '重新授权')
  elements.loginButton.disabled = false
  runtime.buttonAction = 'login'

  renderAdvertiserOptions(
    Array.isArray(token.advertiserIds) ? token.advertiserIds : [],
    Array.isArray(token.advertiserAccounts) ? token.advertiserAccounts : []
  )
  // 店铺概览不依赖计划接口成功，遇到平台限流时也能明确当前查询账户。
  renderCurrentAdvertiser(elements.advertiserSelect.value)
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

const renderResult = (result) => {
  if (result?.ok && result.status === 'success') {
    stopPolling()
    runtime.loginStartedAt = null
    renderUser(result)
    return
  }
  if (result?.status === 'waiting' || result?.status === 'idle') return
  if (!result?.ok) {
    stopPolling()
    runtime.loginStartedAt = null
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
  if (!runtime.loginStartedAt) return
  if (Date.now() - runtime.loginStartedAt > LOGIN_TIMEOUT_MS) {
    stopPolling()
    runtime.loginStartedAt = null
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
  if (runtime.loginStartedAt) {
    runtime.pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS)
  }
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

  runtime.loginStartedAt = result.startedAt ? Date.parse(result.startedAt) : Date.now()
  if (Number.isNaN(runtime.loginStartedAt)) runtime.loginStartedAt = Date.now()
  renderState({
    badge: '等待授权',
    state: 'waiting',
    icon: '↗',
    title: '请在浏览器中完成授权',
    message: '授权成功后可以关闭浏览器，本页面会自动更新。',
    buttonText: '重新打开授权'
  })
  runtime.pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS)
}

/* 商品计划表格渲染 ------------------------------------------------------- */

const createImagePlaceholder = () => createTextElement('span', 'product-image is-empty', '图')

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
  copy.append(
    createTextElement('strong', '', plan.name || '未命名计划'),
    createTextElement('span', '', `ID ${plan.id || '—'} · ${product.name || '未绑定商品'}`)
  )
  wrapper.append(copy)
  return wrapper
}

const renderStatus = (plan) => createTextElement(
  'span',
  `status-pill status-${String(plan.status || '').toLowerCase()}`,
  STATUS_LABELS[plan.status] || plan.status || '未知'
)

const renderType = (plan) => createTextElement(
  'span',
  'type-text',
  plan.scene === 'OVERALL_PROJECT' ? '乘方计划' : '全域计划'
)

const appendCell = (row, { content, className = '' }) => {
  const cell = document.createElement('td')
  if (className) cell.className = className
  if (content instanceof Node) cell.append(content)
  else setText(cell, content)
  row.append(cell)
}

/** 表格列用数据描述，减少重复的 createElement/append 样板代码。 */
const renderPlanRow = (plan) => {
  const row = document.createElement('tr')
  const cells = [
    { content: renderPlanProduct(plan) },
    { content: renderStatus(plan) },
    { content: renderType(plan) },
    { content: formatMoney(plan.metrics?.costYuan), className: 'numeric-cell' },
    { content: formatMetric(plan.metrics?.payRoi), className: 'numeric-cell' },
    { content: formatMoney(plan.metrics?.payGmvYuan), className: 'numeric-cell' },
    { content: formatMetric(plan.metrics?.payOrderCount, ' 单'), className: 'numeric-cell' },
    { content: formatDateTime(plan.createTime) }
  ]
  cells.forEach((cell) => appendCell(row, cell))
  return row
}

const renderCurrentAdvertiser = (advertiserId) => {
  const normalizedId = String(advertiserId || '')
  const account = runtime.advertisersById.get(normalizedId)
  const accountName = account?.advertiserName || account?.shopName
  setText(elements.currentAdvertiser, accountName || (normalizedId ? '千川店铺' : '—'))
  setText(elements.currentAdvertiserMeta, normalizedId ? `广告主 ID ${normalizedId}` : '尚未选择广告主')
}

const renderPlans = (result) => {
  const plans = Array.isArray(result?.plans) ? result.plans : []
  elements.plansTableBody.replaceChildren(...plans.map(renderPlanRow))
  elements.plansEmpty.hidden = plans.length > 0
  setText(elements.planTotal, Number(result?.page?.total || 0).toLocaleString('zh-CN'))
  renderCurrentAdvertiser(result?.advertiserId)
  const queryStartDate = result?.query?.startDate
  const queryEndDate = result?.query?.endDate
  const fullQueryRange = `${queryStartDate || '—'} 至 ${queryEndDate || '—'}`
  setText(elements.queryRange, formatDateRange(queryStartDate, queryEndDate))
  elements.queryRange.title = fullQueryRange

  runtime.currentPage = Number(result?.page?.current || 1)
  runtime.totalPages = Math.max(1, Number(result?.page?.totalPages || 1))
  setText(elements.paginationPage, `${runtime.currentPage} / ${runtime.totalPages}`)
  setText(
    elements.paginationSummary,
    plans.length
      ? `本页 ${plans.length} 条，共 ${result?.page?.total || plans.length} 条`
      : '没有符合条件的计划'
  )
  elements.previousPageButton.disabled = runtime.currentPage <= 1
  elements.nextPageButton.disabled = runtime.currentPage >= runtime.totalPages
}

const renderPlansError = (result) => {
  const message = result?.status === 'reauthorization_required'
    ? '授权已失效，请重新登录后再查看计划。'
    : (result?.message || '获取投放计划失败，请稍后重试。')
  elements.plansError.hidden = false
  setText(elements.plansError, message)
  setText(elements.planLoadingText, '同步失败')

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
  page_size: PLAN_PAGE_SIZE
})

const setPlansLoading = (loading) => {
  elements.refreshPlansButton.disabled = loading
  elements.resetFiltersButton.disabled = loading
  elements.planFilters.querySelectorAll('button, input, select').forEach((element) => {
    element.disabled = loading || (element === elements.advertiserSelect && element.options.length <= 1)
  })
}

/**
 * requestId 防止较慢的旧请求覆盖较新的筛选结果。
 * 这在快速切换店铺、状态或翻页时尤其重要。
 */
const loadPlans = async (overrides = {}) => {
  const requestId = ++runtime.planRequestId
  const requestedPage = overrides.page || runtime.currentPage
  renderCurrentAdvertiser(elements.advertiserSelect.value)
  elements.plansError.hidden = true
  setText(elements.planLoadingText, '正在同步…')
  setPlansLoading(true)

  try {
    const result = await window.qianchuan.plans.list(getPlanFilters(requestedPage))
    if (requestId !== runtime.planRequestId) return
    if (!result?.ok) return renderPlansError(result)

    const syncedAt = new Date().toISOString()
    setText(elements.lastSyncedAt, formatDateTime(syncedAt))
    setText(elements.planLoadingText, `更新于 ${formatDateTime(syncedAt)}`)
    renderPlans(result)
  } catch (error) {
    if (requestId !== runtime.planRequestId) return
    renderPlansError({ message: error?.message || '获取投放计划失败，请稍后重试。' })
  } finally {
    if (requestId === runtime.planRequestId) setPlansLoading(false)
  }
}

const resetPlanFilters = () => {
  elements.advertiserSelect.selectedIndex = 0
  elements.keywordInput.value = ''
  elements.statusSelect.value = 'ALL'
  elements.sceneSelect.value = 'UNI_PROJECT'
  renderCurrentAdvertiser(elements.advertiserSelect.value)
  void loadPlans({ page: 1 })
}

/* 初始化与事件绑定 ------------------------------------------------------- */

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

const bindEvents = () => {
  elements.loginButton.addEventListener('click', () => {
    if (runtime.buttonAction === 'retry') void initialize()
    else void startLogin()
  })
  elements.reauthorizeButton.addEventListener('click', () => void startLogin())
  elements.sidebarReauthorizeButton.addEventListener('click', () => void startLogin())
  elements.planFilters.addEventListener('submit', (event) => {
    event.preventDefault()
    void loadPlans({ page: 1 })
  })
  elements.advertiserSelect.addEventListener('change', () => {
    renderCurrentAdvertiser(elements.advertiserSelect.value)
    void loadPlans({ page: 1 })
  })
  elements.resetFiltersButton.addEventListener('click', resetPlanFilters)
  elements.refreshPlansButton.addEventListener('click', () => void loadPlans())
  elements.previousPageButton.addEventListener('click', () => {
    void loadPlans({ page: Math.max(1, runtime.currentPage - 1) })
  })
  elements.nextPageButton.addEventListener('click', () => {
    void loadPlans({ page: Math.min(runtime.totalPages, runtime.currentPage + 1) })
  })
  window.addEventListener('beforeunload', stopPolling)
}

bindEvents()
void initialize()
