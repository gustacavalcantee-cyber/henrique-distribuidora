import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args))
  },
}

contextBridge.exposeInMainWorld('electron', api)

// Expose app version — use sendSync to get the real version from main process
// (process.env.npm_package_version is only available in dev, not in packaged apps)
const appVersion: string = ipcRenderer.sendSync('get:version') ?? ''
contextBridge.exposeInMainWorld('__APP_VERSION__', appVersion)

export type ElectronAPI = typeof api
