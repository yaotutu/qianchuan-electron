/**
 * Renderer 只负责交互和展示，不直接访问网络或 Node.js。
 * 所有 OAuth 操作都通过 preload 暴露的最小接口进入主进程。
 */
const elements = {
  serviceStatus: document.querySelector("#serviceStatus"),
  serviceStatusText: document.querySelector("#serviceStatusText"),
  authBadge: document.querySelector("#authBadge"),
  stateView: document.querySelector("#stateView"),
  stateIcon: document.querySelector("#stateIcon"),
  stateTitle: document.querySelector("#stateTitle"),
  stateMessage: document.querySelector("#stateMessage"),
  errorCode: document.querySelector("#errorCode"),
  userCard: document.querySelector("#userCard"),
  avatar: document.querySelector("#avatar"),
  userName: document.querySelector("#userName"),
  userId: document.querySelector("#userId"),
  userEmail: document.querySelector("#userEmail"),
  userAppId: document.querySelector("#userAppId"),
  scopeCount: document.querySelector("#scopeCount"),
  tokenExpiresAt: document.querySelector("#tokenExpiresAt"),
  loginButton: document.querySelector("#loginButton"),
};

const POLL_INTERVAL_MS = 2_000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1_000;
let pollTimer = null;
let loginStartedAt = null;
let buttonAction = "login";

const setText = (element, value) => {
  element.textContent = value;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "平台未返回";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const stopPolling = () => {
  if (pollTimer) window.clearTimeout(pollTimer);
  pollTimer = null;
};

const renderService = (state, text) => {
  elements.serviceStatus.dataset.state = state;
  setText(elements.serviceStatusText, text);
};

const renderState = ({
  badge,
  state,
  icon,
  title,
  message,
  buttonText,
  errorCode = "",
  busy = false,
  action = "login",
}) => {
  elements.authBadge.dataset.state = state;
  setText(elements.authBadge, badge);
  elements.stateView.dataset.hidden = "false";
  elements.userCard.dataset.visible = "false";
  elements.stateIcon.replaceChildren();

  if (busy) {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    elements.stateIcon.append(spinner);
  } else {
    setText(elements.stateIcon, icon);
  }

  setText(elements.stateTitle, title);
  setText(elements.stateMessage, message);
  setText(elements.errorCode, errorCode);
  setText(elements.loginButton, buttonText);
  elements.loginButton.disabled = busy;
  buttonAction = action;
};

const renderUser = (result) => {
  const user = result.user || {};
  const token = result.token || {};
  const displayName = user.displayName || "千川用户";

  elements.authBadge.dataset.state = "success";
  setText(elements.authBadge, "已登录");
  elements.stateView.dataset.hidden = "true";
  elements.userCard.dataset.visible = "true";
  setText(elements.avatar, displayName.slice(0, 1));
  setText(elements.userName, displayName);
  setText(elements.userId, `用户 ID：${user.id || "未返回"}`);
  setText(elements.userEmail, user.email || "未返回");
  setText(elements.userAppId, String(user.appId || "未返回"));
  setText(elements.scopeCount, `${user.scopeCount || 0} 项`);
  setText(elements.tokenExpiresAt, formatDateTime(token.accessTokenExpiresAt));
  setText(elements.loginButton, "重新授权");
  elements.loginButton.disabled = false;
  buttonAction = "login";
};

/** 渲染“尚未授权”的正常初始状态。 */
const renderLoggedOut = () => {
  renderState({
    badge: "未登录",
    state: "idle",
    icon: "↗",
    title: "准备开始",
    message: "点击登录后，将在系统浏览器中打开巨量官方授权页面。",
    buttonText: "使用巨量千川登录",
  });
};

/**
 * 根据服务端持久化授权的恢复结果更新页面。
 * Renderer 只处理脱敏结构，不接触 Access Token 或 Refresh Token。
 */
const renderCurrentAuthorization = (result) => {
  if (result?.ok && result.status === "success") {
    renderUser(result);
    return;
  }

  if (result?.ok && result.status === "idle") {
    renderLoggedOut();
    return;
  }

  if (result?.status === "reauthorization_required") {
    renderState({
      badge: "授权已失效",
      state: "error",
      icon: "!",
      title: "需要重新登录",
      message: result.message || "长期授权已失效，请重新完成一次巨量授权。",
      errorCode: "错误码：REAUTHORIZATION_REQUIRED",
      buttonText: "重新登录",
    });
    return;
  }

  if (result?.status === "token_refresh_failed") {
    renderState({
      badge: "续期失败",
      state: "error",
      icon: "!",
      title: "暂时无法恢复登录",
      message: result.message || "服务端暂时无法刷新授权，请稍后重试。",
      errorCode: "错误码：TOKEN_REFRESH_FAILED",
      buttonText: "重新检测",
      action: "retry",
    });
    return;
  }

  renderUnavailable(result);
};

const renderUnavailable = (result) => {
  const isOutdated = result?.status === "server_outdated";
  renderService("offline", isOutdated ? "登录服务需要重启" : "登录服务不可用");
  renderState({
    badge: "暂不可用",
    state: "error",
    icon: "!",
    title: isOutdated ? "登录服务版本未更新" : "暂时无法连接登录服务",
    message:
      result?.message || "请确认登录服务已经启动，然后重新检测。",
    errorCode: isOutdated ? "错误码：SERVER_OUTDATED" : "错误码：SERVER_UNAVAILABLE",
    buttonText: "重新检测",
    action: "retry",
  });
};

const renderResult = (result) => {
  if (result?.ok && result.status === "success") {
    stopPolling();
    loginStartedAt = null;
    renderUser(result);
    return;
  }

  if (result?.status === "waiting" || result?.status === "idle") return;

  if (result && !result.ok) {
    stopPolling();
    loginStartedAt = null;
    renderState({
      badge: "未完成",
      state: "error",
      icon: "!",
      title: "本次登录没有完成",
      message: result.message || result.errorDescription || "请重新发起登录。",
      buttonText: "重新登录",
    });
  }
};

const pollLoginResult = async () => {
  if (!loginStartedAt) return;
  if (Date.now() - loginStartedAt > LOGIN_TIMEOUT_MS) {
    stopPolling();
    loginStartedAt = null;
    renderState({
      badge: "已超时",
      state: "error",
      icon: "!",
      title: "等待授权超时",
      message: "本次授权已超过十分钟，请重新登录。",
      buttonText: "重新登录",
    });
    return;
  }

  const result = await window.qianchuan.oauth.getStatus();
  renderResult(result);
  if (loginStartedAt) pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS);
};

const startLogin = async () => {
  stopPolling();
  renderState({
    badge: "正在打开",
    state: "waiting",
    icon: "",
    title: "正在打开授权页面",
    message: "即将在系统浏览器中打开巨量官方授权页面。",
    buttonText: "正在打开…",
    busy: true,
  });

  const result = await window.qianchuan.oauth.startLogin();
  if (!result?.ok) {
    if (["server_unavailable", "not_configured", "error"].includes(result?.status)) {
      renderUnavailable(result);
    }
    else renderResult(result || { ok: false, message: "无法发起登录。" });
    return;
  }

  loginStartedAt = result.startedAt ? Date.parse(result.startedAt) : Date.now();
  if (Number.isNaN(loginStartedAt)) loginStartedAt = Date.now();
  renderState({
    badge: "等待授权",
    state: "waiting",
    icon: "↗",
    title: "请在浏览器中完成授权",
    message: "授权成功后可以关闭浏览器，本页面会自动更新。",
    buttonText: "重新打开授权",
  });
  pollTimer = window.setTimeout(pollLoginResult, POLL_INTERVAL_MS);
};

const initialize = async () => {
  stopPolling();
  renderService("checking", "正在检测登录服务");
  renderState({
    badge: "检测中",
    state: "idle",
    icon: "",
    title: "正在连接登录服务",
    message: "请稍候。",
    buttonText: "检测中…",
    busy: true,
  });

  if (!window.qianchuan?.oauth) {
    renderUnavailable({ status: "error", message: "客户端安全接口初始化失败，请重启应用。" });
    return;
  }

  const health = await window.qianchuan.oauth.getHealth();
  if (!health?.ok) {
    renderUnavailable(health);
    return;
  }

  renderService("online", "登录服务正常");

  // 服务端会在这里按需刷新 Access Token；成功时可直接恢复上次登录用户。
  const current = await window.qianchuan.oauth.getCurrent();
  renderCurrentAuthorization(current);
};

elements.loginButton.addEventListener("click", () => {
  if (buttonAction === "retry") void initialize();
  else void startLogin();
});

window.addEventListener("beforeunload", stopPolling);
void initialize();
