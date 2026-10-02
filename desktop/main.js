// Application de bureau : lance le serveur Next embarqué (build autonome, mode local) sur la boucle
// locale, puis l'affiche dans une fenêtre. Les schémas restent dans le stockage du navigateur
// d'Electron (IndexedDB), dans le dossier de données de l'application.

const { app, BrowserWindow, dialog, shell, utilityProcess } = require('electron')
const net = require('node:net')
const path = require('node:path')
const { setupUpdates } = require('./updater')

// Port fixe : le stockage du navigateur est rattaché à l'origine (hôte + port). Un autre port,
// et l'utilisateur ne retrouverait plus ses schémas.
const HOST = '127.0.0.1'
const PORT = 43117
const ORIGIN = `http://${HOST}:${PORT}`
// Pages extérieures ouvertes dans la fenêtre plutôt que dans le navigateur : la connexion à
// OpenRouter, qui revient sur /ai/callback avec le vérificateur PKCE gardé par cette fenêtre.
const IN_APP_HOSTS = new Set(['openrouter.ai'])

const fr = () => app.getLocale().startsWith('fr')

let server = null
let mainWindow = null
let quitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(start)
}

async function start() {
  if (!(await portFree())) {
    fail(
      fr()
        ? `Le port ${PORT} est déjà utilisé par un autre programme. Fermez-le, puis relancez Unveilboard.`
        : `Port ${PORT} is already used by another program. Close it, then restart Unveilboard.`,
    )
    return
  }
  startServer()
  try {
    await waitForServer()
  } catch (e) {
    fail(String(e instanceof Error ? e.message : e))
    return
  }
  createWindow()
  setupUpdates()
}

function portFree() {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.listen(PORT, HOST, () => probe.close(() => resolve(true)))
  })
}

function startServer() {
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, 'server')
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOSTNAME: HOST,
    NEXT_TELEMETRY_DISABLED: '1',
    // Libellés propres à l'application (src/i18n/desktop.ts), dès le rendu serveur.
    UNVEILBOARD_DESKTOP: '1',
  }
  // Toujours le mode local, même si l'environnement de l'utilisateur définit une base.
  delete env.DATABASE_URL
  delete env.DATABASE_URL_UNPOOLED
  server = utilityProcess.fork(path.join(dir, 'server.js'), [], { cwd: dir, env, serviceName: 'Unveilboard server' })
  server.on('exit', (code) => {
    server = null
    if (!quitting) fail(fr() ? `Le serveur s'est arrêté (code ${code}).` : `The server stopped (code ${code}).`)
  })
}

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (!server) throw new Error(fr() ? "Le serveur n'a pas démarré." : 'The server did not start.')
    try {
      const res = await fetch(`${ORIGIN}/`, { method: 'HEAD' })
      if (res.status < 500) return
    } catch {
      // Pas encore à l'écoute.
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(fr() ? "Le serveur n'a pas répondu à temps." : 'The server did not respond in time.')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#fbfaf7',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => (mainWindow = null))
  void mainWindow.loadURL(ORIGIN)
}

const isApp = (url) => {
  try {
    return new URL(url).origin === ORIGIN
  } catch {
    return false
  }
}

function openExternal(url) {
  try {
    if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) void shell.openExternal(url)
  } catch {
    // Adresse invalide : ignorée.
  }
}

const isInAppHost = (url) => {
  try {
    return IN_APP_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

// Pour toutes les fenêtres, y compris celle de projection (window.open sur /d/<id>/screen) :
// les pages de l'application restent dans Electron, le reste s'ouvre dans le navigateur.
// Une fois sortie vers une page autorisée (connexion OpenRouter), la fenêtre la laisse mener
// son parcours (connexion Google, GitHub…) jusqu'au retour sur l'application.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isApp(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#000000' } }
    if (!isApp(contents.getURL())) return { action: 'allow' }
    openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isApp(url) || isInAppHost(url) || !isApp(contents.getURL())) return
    event.preventDefault()
    openExternal(url)
  })
})

function fail(message) {
  dialog.showErrorBox('Unveilboard', message)
  app.quit()
}

app.on('before-quit', () => {
  quitting = true
  server?.kill()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow && server) createWindow()
})
