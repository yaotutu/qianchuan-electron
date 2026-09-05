/**
 * 电小奇千川超级商品卡的渲染进程。
 *
 * 设计原则：
 * 1. Renderer 只负责 UI 状态和交互，不接触 Token、Secret 或平台接口。
 * 2. 所有平台数据都当作不可信文本处理，避免把店铺名、计划名当成 HTML 执行。
 * 3. 当前阶段只开放“读取推广计划”，所有计划写操作保留 UI 入口但统一提示未接入。
 * 4. 通过小函数组合渲染逻辑，尽量让状态变化可预测、可测试。
 */

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
  topRunningCount: getElement('topRunningCount'),
  accountSearchInput: getElement('accountSearchInput'),
  selectAllAccountsButton: getElement('selectAllAccountsButton'),
  selectedAccountsCount: getElement('selectedAccountsCount'),
  accountList: getElement('accountList'),
  monitoringView: getElement('monitoringView'),
  monitorManagementPanel: getElement('monitorManagementPanel'),
  monitorCreatePanel: getElement('monitorCreatePanel'),
  featurePlaceholderView: getElement('featurePlaceholderView'),
  placeholderIcon: getElement('placeholderIcon'),
  placeholderTitle: getElement('placeholderTitle'),
  placeholderDescription: getElement('placeholderDescription'),
  backToMonitorButton: getElement('backToMonitorButton'),
  protectedAccountCount: getElement('protectedAccountCount'),
  planTotal: getElement('planTotal'),
  planFilters: getElement('planFilters'),
  advertiserSelect: getElement('advertiserSelect'),
  keywordInput: getElement('keywordInput'),
  statusSelect: getElement('statusSelect'),
  sceneSelect: getElement('sceneSelect'),
  ruleSelect: getElement('ruleSelect'),
  operationSelect: getElement('operationSelect'),
  startDateInput: getElement('startDateInput'),
  endDateInput: getElement('endDateInput'),
  resetFiltersButton: getElement('resetFiltersButton'),
  collapseFiltersButton: getElement('collapseFiltersButton'),
  selectedPlanCount: getElement('selectedPlanCount'),
  monitorIntervalSelect: getElement('monitorIntervalSelect'),
  autoCleanupSwitch: getElement('autoCleanupSwitch'),
  refreshPlansButton: getElement('refreshPlansButton'),
  plansError: getElement('plansError'),
  selectAllPlansCheckbox: getElement('selectAllPlansCheckbox'),
  plansTableBody: getElement('plansTableBody'),
  plansEmpty: getElement('plansEmpty'),
  planLoadingText: getElement('planLoadingText'),
  paginationSummary: getElement('paginationSummary'),
  paginationPage: getElement('paginationPage'),
  queryRange: getElement('queryRange'),
  lastSyncedAt: getElement('lastSyncedAt'),
  previousPageButton: getElement('previousPageButton'),
  nextPageButton: getElement('nextPageButton'),
  appToast: getElement('appToast'),
  // 这两个节点用于兼容旧版登录状态展示，工作台中保持隐藏。
  currentAdvertiser: getElement('currentAdvertiser'),
  currentAdvertiserMeta: getElement('currentAdvertiserMeta')
})

const POLL_INTERVAL_MS = 2_000
const LOGIN_TIMEOUT_MS = 10 * 60 * 1_000
const PLAN_PAGE_SIZE = 20
const WRITE_ACTION_MESSAGE = '当前仅接入推广监控读取，写操作将在对应平台接口接入后开放。'

/** 所有会变化的 UI 状态集中管理，避免组件之间通过隐式全局变量互相影响。 */
const runtime = {
  pollTimer: null,
  loginStartedAt: null,
  buttonAction: 'login',
  currentPage: 1,
  totalPages: 1,
  planRequestId: 0,
  toastTimer: null,
  activeView: 'promotion-monitor',
  activeMonitorTab: 'manage',
  filtersCollapsed: false,
  advertisersById: new Map(),
  advertiserAccounts: [],
  selectedAdvertiserIds: new Set(),
  selectedPlanIds: new Set(),
  visiblePlanIds: []
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

const FEATURE_VIEWS = Object.freeze({
  'account-management': {
    icon: '账',
    title: '账号管理',
    description: '这里将集中管理千川广告主、授权关系和账号状态。当前已复用推广监控的授权账号体系。'
  },
  'promotion-management': {
    icon: '投',
    title: '推广管理',
    description: '这里将承载全域推广计划的创建、编辑、复制和批量操作。当前阶段先完成展示框架。'
  },
  'promotion-data': {
    icon: '数',
    title: '推广数据',
    description: '这里将展示投放消耗、成交、ROI 和商品维度的数据分析。后续接入对应数据接口。'
  },
  'multiplier-management': {
    icon: '乘',
    title: '乘方管理',
    description: '千川乘方计划管理页面已经预留，后续接入乘方专属接口和操作能力。'
  },
  'multiplier-monitor': {
    icon: '监',
    title: '乘方监控',
    description: '千川乘方监控将沿用当前账号体系和监控工作流，后续补充规则配置。'
  },
  'multiplier-data': {
    icon: '析',
    title: '乘方数据',
    description: '千川乘方的数据看板和报表能力将在后续版本接入。'
  }
})

const setText = (element, value) => {
  element.textContent = String(value ?? '')
}

/** 仅生成文本节点，业务数据永远不通过 innerHTML 注入。 */
const createTextElement = (tagName, className, text) => {
  const element = document.createElement(tagName)
  if (className) element.className = className
  setText(element, text)
  return element
}

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

const getAdvertiserName = (advertiserId) => {
  const account = runtime.advertisersById.get(String(advertiserId || ''))
  return account?.advertiserName || account?.shopName || (advertiserId ? `广告主 ${advertiserId}` : '—')
}

const showToast = (message) => {
  window.clearTimeout(runtime.toastTimer)
  setText(elements.appToast, message)
  elements.appToast.hidden = false
  runtime.toastTimer = window.setTimeout(() => {
    elements.appToast.hidden = true
  }, 3_000)
}

const stopPolling = () => {
  if (runtime.pollTimer) window.clearTimeout(runtime.pollTimer)
  runtime.pollTimer = null
}

const renderService = (state, text) => {
  elements.serviceStatus.dataset.state = state
  setText(elements.serviceStatusText, text)
}

const renderState = ({ badge, state, icon, title, message, buttonText, errorCode = '', busy = false, action = 'login' }) => {
  elements.authBadge.dataset.state = state
  setText(elements.authBadge, badge)
  elements.stateView.dataset.hidden = 'false'
  elements.userCard.dataset.visible = 'false'
  elements.stateIcon.replaceChildren()
  if (busy) elements.stateIcon.append(createTextElement('span', 'spinner', ''))
  else setText(elements.stateIcon, icon)
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

/** 根据服务端返回的广告主列表同步下拉框和左侧账号栏。 */
const renderAdvertiserOptions = (advertiserIds = [], advertiserAccounts = []) => {
  runtime.advertiserAccounts = Array.isArray(advertiserAccounts) ? advertiserAccounts : []
  runtime.advertisersById = new Map(
    runtime.advertiserAccounts
      .filter((account) => account?.advertiserId)
      .map((account) => [String(account.advertiserId), account])
  )

  const normalizedIds = [...new Set(advertiserIds.map(String).filter(Boolean))]
  if (!normalizedIds.length) {
    elements.advertiserSelect.replaceChildren(createTextElement('option', '', '未返回授权店铺'))
    elements.advertiserSelect.firstElementChild.value = ''
    elements.advertiserSelect.disabled = true
  } else {
    const options = normalizedIds.map((advertiserId, index) => {
      const option = createTextElement('option', '', `${getAdvertiserName(advertiserId)}（${advertiserId}）`)
      option.value = advertiserId
      option.selected = index === 0
      return option
    })
    elements.advertiserSelect.replaceChildren(...options)
    elements.advertiserSelect.disabled = normalizedIds.length <= 1
  }

  runtime.selectedAdvertiserIds = new Set(normalizedIds)
  renderAccountList()
  setText(elements.protectedAccountCount, normalizedIds.length)
}

const getFilteredAccounts = () => {
  const keyword = elements.accountSearchInput.value.trim().toLowerCase()
  return runtime.advertiserAccounts.filter((account) => {
    const text = [account?.advertiserName, account?.shopName, account?.advertiserId].filter(Boolean).join(' ').toLowerCase()
    return !keyword || text.includes(keyword)
  })
}

const createAccountRow = (account) => {
  const advertiserId = String(account?.advertiserId || '')
  const row = document.createElement('button')
  row.type = 'button'
  row.className = 'account-row'
  row.dataset.advertiserId = advertiserId
  row.classList.toggle('is-current', advertiserId === elements.advertiserSelect.value)

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.tabIndex = -1
  checkbox.checked = runtime.selectedAdvertiserIds.has(advertiserId)
  checkbox.setAttribute('aria-label', `选择 ${getAdvertiserName(advertiserId)}`)
  checkbox.addEventListener('click', (event) => event.stopPropagation())
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) runtime.selectedAdvertiserIds.add(advertiserId)
    else runtime.selectedAdvertiserIds.delete(advertiserId)
    updateAccountSelection()
  })

  const copy = document.createElement('span')
  copy.className = 'account-copy'
  copy.append(
    createTextElement('strong', '', getAdvertiserName(advertiserId)),
    createTextElement('small', '', `🔗 已授权 · ${advertiserId}`)
  )

  const state = document.createElement('span')
  state.className = 'account-state'
  state.append(createTextElement('b', '', '生效'), createTextElement('small', '', '去后台'))
  row.append(checkbox, copy, state)
  return row
}

const updateAccountSelection = () => {
  setText(elements.selectedAccountsCount, runtime.selectedAdvertiserIds.size)
  const total = runtime.advertiserAccounts.length
  elements.selectAllAccountsButton.textContent = total > 0 && runtime.selectedAdvertiserIds.size === total ? '取消全选' : '选择全部'
}

const renderAccountList = () => {
  const accounts = getFilteredAccounts()
  if (!accounts.length) {
    elements.accountList.replaceChildren(createTextElement('div', 'account-list-empty', '没有匹配的千川账号'))
  } else {
    elements.accountList.replaceChildren(...accounts.map(createAccountRow))
  }
  updateAccountSelection()
}

const selectCurrentAdvertiser = (advertiserId) => {
  if (!advertiserId) return
  elements.advertiserSelect.value = advertiserId
  renderCurrentAdvertiser(advertiserId)
  renderAccountList()
  void loadPlans({ page: 1 })
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
    return renderState({ badge: '授权已失效', state: 'error', icon: '!', title: '需要重新登录', message: result.message || '长期授权已失效，请重新完成一次巨量授权。', errorCode: '错误码：REAUTHORIZATION_REQUIRED', buttonText: '重新登录' })
  }
  if (result?.status === 'token_refresh_failed') {
    showLogin()
    return renderState({ badge: '续期失败', state: 'error', icon: '!', title: '暂时无法恢复登录', message: result.message || '登录服务暂时无法续期授权，请稍后重新检测。', errorCode: '错误码：TOKEN_REFRESH_FAILED', buttonText: '重新检测', action: 'retry' })
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
  stopPolling()
  runtime.loginStartedAt = null
  renderState({ badge: '未完成', state: 'error', icon: '!', title: '本次登录没有完成', message: result?.message || result?.errorDescription || '请重新发起登录。', buttonText: '重新登录' })
}

const pollLoginResult = async () => {
  if (!runtime.loginStartedAt) return
  if (Date.now() - runtime.loginStartedAt > LOGIN_TIMEOUT_MS) {
    stopPolling()
    runtime.loginStartedAt = null
    return renderState({ badge: '已超时', state: 'error', icon: '!', title: '等待授权超时', message: '本次授权已超过十分钟，请重新登录。', buttonText: '重新登录' })
  }
  try {
    const result = await window.qianchuan.oauth.getStatus()
    renderResult(result)
  } catch (error) {
    showToast(error?.message || '读取授权状态失败')
  }
  if (runtime.loginStartedAt) runtime.pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS)
}

const startLogin = async () => {
  stopPolling()
  showLogin()
  renderState({ badge: '正在打开', state: 'waiting', icon: '', title: '正在打开授权页面', message: '即将在系统浏览器中打开巨量官方授权页面。', buttonText: '正在打开…', busy: true })
  try {
    const result = await window.qianchuan.oauth.startLogin()
    if (!result?.ok) {
      const unavailableStatuses = ['server_unavailable', 'not_configured', 'error']
      return unavailableStatuses.includes(result?.status) ? renderUnavailable(result) : renderResult(result || { ok: false, message: '无法发起登录。' })
    }
    runtime.loginStartedAt = result.startedAt ? Date.parse(result.startedAt) : Date.now()
    if (Number.isNaN(runtime.loginStartedAt)) runtime.loginStartedAt = Date.now()
    renderState({ badge: '等待授权', state: 'waiting', icon: '↗', title: '请在浏览器中完成授权', message: '授权成功后可以关闭浏览器，本页面会自动更新。', buttonText: '重新打开授权' })
    runtime.pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS)
  } catch (error) {
    renderUnavailable({ status: 'error', message: error?.message || '无法发起登录。' })
  }
}

const renderCurrentAdvertiser = (advertiserId) => {
  const normalizedId = String(advertiserId || '')
  setText(elements.currentAdvertiser, getAdvertiserName(normalizedId))
  setText(elements.currentAdvertiserMeta, normalizedId ? `广告主 ID ${normalizedId}` : '尚未选择广告主')
}

const getStatusClass = (status) => {
  if (status === 'DELIVERY_OK') return 'is-running'
  if (['AUDIT', 'REAUDIT'].includes(status)) return 'is-review'
  return 'is-ended'
}

const appendCell = (row, content, className = '') => {
  const cell = document.createElement('td')
  if (className) cell.className = className
  if (content instanceof HTMLElement) cell.append(content)
  else setText(cell, content)
  row.append(cell)
}

const createPlanCheckbox = (planId) => {
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'plan-row-checkbox'
  checkbox.dataset.planId = String(planId || '')
  checkbox.checked = runtime.selectedPlanIds.has(String(planId || ''))
  checkbox.setAttribute('aria-label', `选择计划 ${planId || ''}`)
  return checkbox
}

const renderPlanName = (plan) => {
  const product = plan.products?.[0] || {}
  const wrapper = document.createElement('div')
  wrapper.className = 'plan-main'
  if (product.image) {
    const image = document.createElement('img')
    image.className = 'product-image'
    image.src = product.image
    image.alt = product.name || '商品预览图'
    image.loading = 'lazy'
    image.addEventListener('error', () => image.replaceWith(createTextElement('span', 'product-image is-empty', '图')), { once: true })
    wrapper.append(image)
  } else wrapper.append(createTextElement('span', 'product-image is-empty', '图'))

  const copy = document.createElement('div')
  copy.className = 'plan-copy'
  copy.append(
    createTextElement('strong', '', plan.name || '未命名计划'),
    createTextElement('span', '', `全域推广 · ID ${plan.id || '—'}`)
  )
  wrapper.append(copy)
  return wrapper
}

const renderPlanRow = (plan) => {
  const row = document.createElement('tr')
  const planId = String(plan.id || '')
  const checkboxCell = document.createElement('td')
  checkboxCell.className = 'checkbox-column'
  checkboxCell.append(createPlanCheckbox(planId))
  row.append(checkboxCell)

  appendCell(row, renderPlanName(plan), 'monitor-plan-column')
  appendCell(row, getAdvertiserName(plan.advertiserId || elements.advertiserSelect.value), 'account-column')

  const status = createTextElement('span', `monitor-status ${getStatusClass(plan.status)}`, STATUS_LABELS[plan.status] || plan.status || '未知')
  appendCell(row, status)
  appendCell(row, '未分组', 'group-name')

  const metrics = plan.metrics || {}
  const executionLog = document.createElement('span')
  executionLog.className = 'execution-log'
  executionLog.append(
    createTextElement('span', '', `同步成功 · 消耗 ${formatMoney(metrics.costYuan)}`),
    createTextElement('small', '', `${formatDateTime(plan.createTime)} · ROI ${formatMetric(metrics.payRoi)}`)
  )
  appendCell(row, executionLog)

  const actions = document.createElement('div')
  actions.className = 'operation-actions'
  ;['详情', '编辑', '开始', '复制', '删除'].forEach((label) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    if (label === '删除') button.className = 'is-danger'
    button.dataset.writeAction = label
    actions.append(button)
  })
  appendCell(row, actions, 'operation-column')
  return row
}

const updatePlanSelection = () => {
  const visibleIds = runtime.visiblePlanIds
  const selectedVisibleCount = visibleIds.filter((id) => runtime.selectedPlanIds.has(id)).length
  setText(elements.selectedPlanCount, runtime.selectedPlanIds.size)
  elements.selectAllPlansCheckbox.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  elements.selectAllPlansCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length
}

const renderPlans = (result) => {
  const plans = Array.isArray(result?.plans) ? result.plans : []
  runtime.visiblePlanIds = plans.map((plan) => String(plan.id || '')).filter(Boolean)
  elements.plansTableBody.replaceChildren(...plans.map(renderPlanRow))
  elements.plansEmpty.hidden = plans.length > 0
  setText(elements.planTotal, Number(result?.page?.total || 0).toLocaleString('zh-CN'))
  setText(elements.topRunningCount, Number(result?.page?.total || 0).toLocaleString('zh-CN'))
  renderCurrentAdvertiser(result?.advertiserId || elements.advertiserSelect.value)
  const queryStartDate = result?.query?.startDate || result?.query?.start_date
  const queryEndDate = result?.query?.endDate || result?.query?.end_date
  elements.queryRange.title = `${queryStartDate || '—'} 至 ${queryEndDate || '—'}`
  setText(elements.queryRange, formatDateRange(queryStartDate, queryEndDate))
  runtime.currentPage = Number(result?.page?.current || 1)
  runtime.totalPages = Math.max(1, Number(result?.page?.totalPages || 1))
  setText(elements.paginationPage, `${runtime.currentPage} / ${runtime.totalPages}`)
  setText(elements.paginationSummary, plans.length ? `本页 ${plans.length} 条，共 ${result?.page?.total || plans.length} 条` : '没有符合条件的计划')
  elements.previousPageButton.disabled = runtime.currentPage <= 1
  elements.nextPageButton.disabled = runtime.currentPage >= runtime.totalPages
  updatePlanSelection()
}

const renderPlansError = (result) => {
  const message = result?.status === 'reauthorization_required' ? '授权已失效，请重新登录后再查看计划。' : (result?.message || '获取投放计划失败，请稍后重试。')
  elements.plansError.hidden = false
  setText(elements.plansError, message)
  setText(elements.planLoadingText, '同步失败')
  if (result?.status === 'reauthorization_required') {
    showLogin()
    renderState({ badge: '授权已失效', state: 'error', icon: '!', title: '需要重新登录', message, buttonText: '重新登录' })
  }
}

const getPlanFilters = (page) => ({
  advertiser_id: elements.advertiserSelect.value,
  keyword: elements.keywordInput.value.trim(),
  status: elements.statusSelect.value,
  scene: elements.sceneSelect.value,
  start_date: elements.startDateInput.value,
  end_date: elements.endDateInput.value,
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

const loadPlans = async (overrides = {}) => {
  const requestId = ++runtime.planRequestId
  const requestedPage = Number(overrides.page || runtime.currentPage || 1)
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
    if (requestId === runtime.planRequestId) renderPlansError({ message: error?.message || '获取投放计划失败，请稍后重试。' })
  } finally {
    if (requestId === runtime.planRequestId) setPlansLoading(false)
  }
}

const resetPlanFilters = () => {
  elements.advertiserSelect.selectedIndex = 0
  elements.keywordInput.value = ''
  elements.statusSelect.value = 'ALL'
  elements.sceneSelect.value = 'UNI_PROJECT'
  elements.ruleSelect.value = 'ALL'
  elements.operationSelect.value = 'ALL'
  elements.startDateInput.value = ''
  elements.endDateInput.value = ''
  runtime.selectedPlanIds.clear()
  renderCurrentAdvertiser(elements.advertiserSelect.value)
  void loadPlans({ page: 1 })
}

const setMonitorTab = (tab) => {
  runtime.activeMonitorTab = tab
  document.querySelectorAll('[data-monitor-tab]').forEach((button) => {
    if (button.tagName !== 'BUTTON') return
    const isActive = button.dataset.monitorTab === tab
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-selected', String(isActive))
  })
  elements.monitorManagementPanel.hidden = tab !== 'manage'
  elements.monitorCreatePanel.hidden = tab !== 'create'
}

const setActiveView = (view) => {
  runtime.activeView = view
  document.querySelectorAll('[data-view]').forEach((button) => {
    const isActive = button.dataset.view === view
    button.classList.toggle('is-active', isActive)
    if (isActive) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
  const isMonitor = view === 'promotion-monitor'
  elements.monitoringView.hidden = !isMonitor
  elements.featurePlaceholderView.hidden = isMonitor
  if (!isMonitor) {
    const feature = FEATURE_VIEWS[view] || FEATURE_VIEWS['promotion-management']
    setText(elements.placeholderIcon, feature.icon)
    setText(elements.placeholderTitle, feature.title)
    setText(elements.placeholderDescription, feature.description)
  }
}

const toggleFilters = () => {
  runtime.filtersCollapsed = !runtime.filtersCollapsed
  elements.planFilters.classList.toggle('is-collapsed', runtime.filtersCollapsed)
  setText(elements.collapseFiltersButton, runtime.filtersCollapsed ? '展开' : '收起')
}

const bindEvents = () => {
  elements.loginButton.addEventListener('click', () => {
    if (runtime.buttonAction === 'retry') void initialize()
    else void startLogin()
  })
  elements.reauthorizeButton.addEventListener('click', () => void startLogin())
  elements.sidebarReauthorizeButton.addEventListener('click', () => void startLogin())
  elements.accountSearchInput.addEventListener('input', renderAccountList)
  elements.selectAllAccountsButton.addEventListener('click', () => {
    const allSelected = runtime.advertiserAccounts.length > 0 && runtime.selectedAdvertiserIds.size === runtime.advertiserAccounts.length
    runtime.selectedAdvertiserIds = allSelected ? new Set() : new Set(runtime.advertiserAccounts.map((account) => String(account.advertiserId || '')).filter(Boolean))
    renderAccountList()
  })
  elements.accountList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-advertiser-id]')
    if (row) selectCurrentAdvertiser(row.dataset.advertiserId)
  })
  elements.planFilters.addEventListener('submit', (event) => {
    event.preventDefault()
    runtime.selectedPlanIds.clear()
    void loadPlans({ page: 1 })
  })
  elements.advertiserSelect.addEventListener('change', () => selectCurrentAdvertiser(elements.advertiserSelect.value))
  elements.resetFiltersButton.addEventListener('click', resetPlanFilters)
  elements.collapseFiltersButton.addEventListener('click', toggleFilters)
  elements.refreshPlansButton.addEventListener('click', () => void loadPlans())
  elements.previousPageButton.addEventListener('click', () => {
    runtime.selectedPlanIds.clear()
    void loadPlans({ page: Math.max(1, runtime.currentPage - 1) })
  })
  elements.nextPageButton.addEventListener('click', () => {
    runtime.selectedPlanIds.clear()
    void loadPlans({ page: Math.min(runtime.totalPages, runtime.currentPage + 1) })
  })
  elements.selectAllPlansCheckbox.addEventListener('change', () => {
    runtime.visiblePlanIds.forEach((id) => {
      if (elements.selectAllPlansCheckbox.checked) runtime.selectedPlanIds.add(id)
      else runtime.selectedPlanIds.delete(id)
    })
    document.querySelectorAll('.plan-row-checkbox').forEach((checkbox) => {
      checkbox.checked = elements.selectAllPlansCheckbox.checked
    })
    updatePlanSelection()
  })
  elements.plansTableBody.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.plan-row-checkbox')
    if (!checkbox) return
    if (checkbox.checked) runtime.selectedPlanIds.add(checkbox.dataset.planId)
    else runtime.selectedPlanIds.delete(checkbox.dataset.planId)
    updatePlanSelection()
  })
  elements.plansTableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-write-action]')
    if (button) showToast(WRITE_ACTION_MESSAGE)
  })
  document.querySelectorAll('[data-batch-action]').forEach((button) => button.addEventListener('click', () => showToast(WRITE_ACTION_MESSAGE)))
  document.querySelectorAll('[data-coming-soon]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.comingSoon)))
  elements.autoCleanupSwitch.addEventListener('click', () => {
    const enabled = elements.autoCleanupSwitch.getAttribute('aria-checked') === 'true'
    elements.autoCleanupSwitch.setAttribute('aria-checked', String(!enabled))
    showToast('自动清理开关已保存为界面配置，自动化执行将在后续版本接入。')
  })
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setActiveView(button.dataset.view)))
  document.querySelectorAll('[data-monitor-tab]').forEach((button) => button.addEventListener('click', () => setMonitorTab(button.dataset.monitorTab)))
  elements.backToMonitorButton.addEventListener('click', () => setActiveView('promotion-monitor'))
  window.addEventListener('beforeunload', stopPolling)
}

const initialize = async () => {
  stopPolling()
  renderService('checking', '正在检测登录服务')
  renderState({ badge: '检测中', state: 'idle', icon: '', title: '正在连接登录服务', message: '请稍候。', buttonText: '检测中…', busy: true })
  if (!window.qianchuan?.oauth || !window.qianchuan?.plans) return renderUnavailable({ status: 'error', message: '客户端安全接口初始化失败，请重启应用。' })
  try {
    const health = await window.qianchuan.oauth.getHealth()
    if (!health?.ok) return renderUnavailable(health)
    renderService('online', '登录服务正常')
    return renderCurrentAuthorization(await window.qianchuan.oauth.getCurrent())
  } catch (error) {
    return renderUnavailable({ status: 'error', message: error?.message || '无法连接登录服务。' })
  }
}

bindEvents()
void initialize()
