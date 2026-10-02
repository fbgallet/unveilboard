// Pont entre les pages et le processus principal (voir src/lib/desktop.ts) : signale l'application de
// bureau et donne accès à la connexion ChatGPT (desktop/chatgpt.js), sans jamais exposer de jeton.
const { contextBridge, ipcRenderer } = require('electron')

/** Abonnement à un événement du processus principal ; renvoie de quoi se désabonner. */
function on(channel, listener) {
  const handler = (_event, ...args) => listener(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('unveilboardDesktop', {
  platform: process.platform,
  chatgpt: {
    state: () => ipcRenderer.invoke('chatgpt:state'),
    signIn: (options) => ipcRenderer.invoke('chatgpt:sign-in', options),
    cancelSignIn: () => ipcRenderer.invoke('chatgpt:cancel-sign-in'),
    signOut: () => ipcRenderer.invoke('chatgpt:sign-out'),
    models: () => ipcRenderer.invoke('chatgpt:models'),
    request: (id, body) => ipcRenderer.invoke('chatgpt:request', id, body),
    abort: (id) => ipcRenderer.invoke('chatgpt:abort', id),
    onState: (listener) => on('chatgpt:state', listener),
    onChunk: (listener) => on('chatgpt:chunk', listener),
  },
})
