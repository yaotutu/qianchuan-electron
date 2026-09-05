const { contextBridge, ipcRenderer } = require("electron");

/**
 * preload 是渲染进程和主进程之间的安全边界。
 * 只暴露 OAuth 所需的四个无敏感参数方法，不暴露 ipcRenderer、shell 或 Node.js 能力。
 */
contextBridge.exposeInMainWorld("qianchuan", {
  oauth: {
    startLogin: () => ipcRenderer.invoke("oauth:start-login"),
    getStatus: () => ipcRenderer.invoke("oauth:get-status"),
    getCurrent: () => ipcRenderer.invoke("oauth:get-current"),
    getHealth: () => ipcRenderer.invoke("oauth:get-health"),
  },
});
