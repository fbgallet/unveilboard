// Signale aux pages qu'elles tournent dans l'application de bureau (voir src/lib/desktop.ts).
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('unveilboardDesktop', { platform: process.platform })
