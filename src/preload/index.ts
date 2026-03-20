import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args))
  },
}

contextBridge.exposeInMainWorld('electron', api)

// Expose app version for the updater UI
contextBridge.exposeInMainWorld('__APP_VERSION__', process.env['npm_package_version'] ?? '')

export type ElectronAPI = typeof api
