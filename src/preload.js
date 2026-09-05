const { contextBridge, ipcRenderer } = require("electron");

/**
 * preload 是渲染进程和主进程之间的安全边界。
 * 只暴露按业务划分的最小 API，Renderer 不拿到 ipcRenderer、shell、Token 或 Node.js 能力。
 */
contextBridge.exposeInMainWorld("qianchuan", {
  auth: {
    startLogin: () => ipcRenderer.invoke("oauth:start-login"),
    getLoginStatus: () => ipcRenderer.invoke("oauth:get-status"),
    getCurrent: () => ipcRenderer.invoke("oauth:get-current"),
    getHealth: () => ipcRenderer.invoke("oauth:get-health"),
  },
  promotionMonitor: {
    listPlans: (filters) => ipcRenderer.invoke("plans:list", filters),
  },

  // 暂时保留旧命名，便于旧版页面回退和灰度排查；新 React 页面不依赖这些别名。
  oauth: {
    startLogin: () => ipcRenderer.invoke("oauth:start-login"),
    getStatus: () => ipcRenderer.invoke("oauth:get-status"),
    getCurrent: () => ipcRenderer.invoke("oauth:get-current"),
    getHealth: () => ipcRenderer.invoke("oauth:get-health"),
  },
  plans: {
    list: (filters) => ipcRenderer.invoke("plans:list", filters),
  },
});
