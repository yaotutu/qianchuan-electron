import { BrowserWindow, shell } from 'electron'

type MainWindowOptions = {
  rendererUrl?: string
  preloadPath: string
  rendererFilePath: string
}

/** 创建主窗口并集中维护 Electron 安全配置和外链策略。 */
export const createMainWindow = async ({ rendererUrl, preloadPath, rendererFilePath }: MainWindowOptions) => {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1120,
    minHeight: 640,
    backgroundColor: '#f5f6f9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (rendererUrl) await mainWindow.loadURL(rendererUrl)
  else await mainWindow.loadFile(rendererFilePath)
  return mainWindow
}
