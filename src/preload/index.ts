import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
  // Returns an unsubscribe function so React components can clean up on unmount
  // without the preload keeping an ever-growing list of listeners each time a
  // page re-mounts. Older call sites that ignore the return value still work
  // but will accumulate listeners — update them to use the returned cleanup.
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('electron', api)

// Expose app version — use sendSync to get the real version from main process
// (process.env.npm_package_version is only available in dev, not in packaged apps)
const appVersion: string = ipcRenderer.sendSync('get:version') ?? ''
contextBridge.exposeInMainWorld('__APP_VERSION__', appVersion)

export type ElectronAPI = typeof api
