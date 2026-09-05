const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

/**
 * OAuth 服务端地址只放在 Electron 主进程中读取。
 * 开发阶段默认使用本机 3100 端口；如果服务端部署在公网，可通过环境变量覆盖：
 * QIANCHUAN_OAUTH_SERVER_URL=https://你的服务端域名
 */
const oauthServerUrl = (
  process.env.QIANCHUAN_OAUTH_SERVER_URL || "http://127.0.0.1:3100"
).replace(/\/+$/, "");
const requestTimeoutMs = 20_000;
let activeAttemptId = null;
let activeLoginStartedAt = null;

/**
 * 统一请求 OAuth 服务端 JSON。
 * Electron 页面不直接访问巨量接口，所有请求都由主进程转发到我们自己的服务端。
 */
const requestOAuthServer = async (pathname) => {
  let response;

  try {
    response = await fetch(`${oauthServerUrl}${pathname}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    throw new Error(
      `无法连接 OAuth 服务端（${oauthServerUrl}）。请先启动 qianchuan-oauth-callback。`,
      { cause: error },
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("OAuth 服务端返回了无法解析的数据。", { cause: error });
  }

  if (!response.ok) {
    const message = payload?.message || `OAuth 服务端请求失败（HTTP ${response.status}）`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.payload = payload;
    throw requestError;
  }

  return payload;
};

/**
 * 发起登录：主进程从服务端拿到授权地址后调用系统浏览器打开。
 * 完整授权 URL 只在主进程内部使用，不注入页面，也不打印到日志。
 */
const startOAuthLogin = async () => {
  const result = await requestOAuthServer("/oauth/oceanengine/start?format=json");
  if (!result.ok || !result.authorizationUrl || !result.attemptId) {
    return {
      ok: false,
      status: "server_unavailable",
      message: "登录服务暂未准备好，请稍后重试。",
    };
  }

  activeAttemptId = result.attemptId;
  activeLoginStartedAt = result.startedAt || new Date().toISOString();
  await shell.openExternal(result.authorizationUrl);
  return {
    ok: true,
    status: "waiting",
    startedAt: activeLoginStartedAt,
    expiresInSeconds: result.expiresInSeconds,
    message: "已打开巨量授权页面，请在浏览器中完成授权。",
  };
};

/**
 * 查询服务端最近一次授权结果。
 * 404 代表还没有完成过授权，转换成前端容易处理的 idle 状态。
 */
const getOAuthStatus = async () => {
  if (!activeAttemptId) {
    return { ok: true, status: "idle", message: "还没有发起本次授权。" };
  }

  try {
    const attemptId = encodeURIComponent(activeAttemptId);
    const result = await requestOAuthServer(`/oauth/result?attempt_id=${attemptId}`);

    // 授权已经结束后立即清理主进程内的一次性尝试，避免后续误读旧结果。
    if (result?.status !== "waiting") {
      activeAttemptId = null;
      activeLoginStartedAt = null;
    }
    return result;
  } catch (error) {
    if (error.status === 404) {
      activeAttemptId = null;
      activeLoginStartedAt = null;
      return {
        ok: false,
        status: "expired",
        message: "本次登录请求已经失效，请重新登录。",
      };
    }
    throw error;
  }
};

/**
 * 恢复服务端最近一次持久化授权。
 * 404 表示从未授权；401 则区分“必须重登”和“暂时刷新失败”。
 */
const getCurrentAuthorization = async () => {
  try {
    return await requestOAuthServer("/oauth/current");
  } catch (error) {
    if (error.status === 404) {
      return { ok: true, status: "idle", message: "当前还没有完成授权。" };
    }

    if (error.status === 401) {
      const requiresLogin = error.payload?.status === "reauthorization_required";
      return {
        ok: false,
        status: requiresLogin ? "reauthorization_required" : "token_refresh_failed",
        message: requiresLogin
          ? "授权已失效，请重新登录。"
          : "登录服务暂时无法续期授权，请稍后重新检测。",
      };
    }

    throw error;
  }
};

const getOAuthHealth = async () => {
  const health = await requestOAuthServer("/health");
  const capabilities = Array.isArray(health.capabilities) ? health.capabilities : [];
  const requiredCapabilities = ["oauth-attempt-result", "current-authorization", "product-plan-list"];

  // 旧服务不具备持久化恢复能力，必须提示重启，不能继续按新协议调用。
  if (!health.version || requiredCapabilities.some((name) => !capabilities.includes(name))) {
    return {
      ok: false,
      status: "server_outdated",
      message: "登录服务仍在运行旧版本，请重启登录服务后再试。",
    };
  }

  if (!health.configured) {
    // 具体缺少哪些环境变量只写入开发者控制台，不展示给最终用户。
    console.error("OAuth 服务端配置未完成：", health.missingConfig || []);
    return {
      ok: false,
      status: "server_unavailable",
      message: "登录服务暂未准备好，请稍后重试。",
    };
  }

  return { ok: true, status: "ready", version: health.version };
};


/**
 * 只把允许的计划筛选项发送给自有服务端。
 * Renderer 即使传入额外字段，也不会被拼接到 URL 或影响服务端请求。
 */
const createProductPlanSearch = (filters = {}) => {
  const params = new URLSearchParams();
  const allowedKeys = [
    "advertiser_id",
    "keyword",
    "status",
    "scene",
    "start_date",
    "end_date",
    "page",
    "page_size",
  ];

  allowedKeys.forEach((key) => {
    const value = filters?.[key];
    if (["string", "number"].includes(typeof value) && String(value).trim()) {
      params.set(key, String(value).trim());
    }
  });
  return params;
};

/** 由主进程代替 Renderer 请求商品投放计划，Token 始终停留在服务端。 */
const getProductPlans = async (filters) => {
  const params = createProductPlanSearch(filters);
  return requestOAuthServer(`/api/qianchuan/product-plans?${params.toString()}`);
};

/**
 * 将异常转成不包含敏感数据的 IPC 响应。
 * 主进程也不把 error.stack 传给 Renderer，避免暴露本地路径和内部细节。
 */
const toSafeError = (error) => {
  // 服务端 503 可能附带仅供开发者排查的配置详情，IPC 统一改成通用文案，
  // 防止环境变量名称或后续新增的内部信息进入 Renderer 页面。
  if (error?.status === 503) {
    return {
      ok: false,
      status: "server_unavailable",
      message: "登录服务暂未准备好，请稍后重试。",
    };
  }

  if (error?.payload && [400, 401, 403, 502].includes(error.status)) {
    return {
      ok: false,
      status: error.payload.status || "error",
      message: error.payload.message || "服务端请求失败。",
      platformCode: error.payload.platformCode ?? null,
    };
  }

  return {
    ok: false,
    status: "error",
    message: error instanceof Error ? error.message : "请求服务端时发生未知错误。",
  };
};

const registerIpcHandlers = () => {
  ipcMain.handle("oauth:start-login", async () => {
    try {
      return await startOAuthLogin();
    } catch (error) {
      return toSafeError(error);
    }
  });

  ipcMain.handle("oauth:get-status", async () => {
    try {
      return await getOAuthStatus();
    } catch (error) {
      return toSafeError(error);
    }
  });

  ipcMain.handle("oauth:get-current", async () => {
    try {
      return await getCurrentAuthorization();
    } catch (error) {
      return toSafeError(error);
    }
  });

  ipcMain.handle("oauth:get-health", async () => {
    try {
      return await getOAuthHealth();
    } catch (error) {
      return toSafeError(error);
    }
  });


  ipcMain.handle("plans:list", async (_event, filters) => {
    try {
      return await getProductPlans(filters);
    } catch (error) {
      return toSafeError(error);
    }
  });
};

/**
 * 创建应用主窗口。
 * 页面不直接访问 Node.js，只通过 preload 暴露的最小 OAuth API 与主进程通信。
 */
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1080,
    minHeight: 680,
    minHeight: 560,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 外部链接交给系统默认浏览器打开，不在应用窗口中加载未知页面。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
