// Mises à jour, depuis les GitHub Releases du dépôt (fichiers latest*.yml publiés par electron-builder).
// - Windows et Linux (AppImage) : téléchargement en arrière-plan, installation au redémarrage.
// - macOS : sans signature Apple, Squirrel.Mac refuse d'installer une mise à jour ; on signale
//   seulement la nouvelle version, avec un lien vers la page de téléchargement.

const { app, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')

const RELEASES_URL = 'https://github.com/fbgallet/unveilboard/releases/latest'
const CHECK_EVERY = 6 * 60 * 60 * 1000

function setupUpdates() {
  if (!app.isPackaged) return
  const fr = app.getLocale().startsWith('fr')
  const manual = process.platform === 'darwin'
  let announced = null

  // Ses propres journaux sont très bavards (en-têtes HTTP complets) : on ne garde que les nôtres.
  autoUpdater.logger = null
  autoUpdater.autoDownload = !manual
  // Si l'utilisateur remet le redémarrage à plus tard, la mise à jour s'installe en quittant.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', async ({ version }) => {
    if (!manual || announced === version) return
    announced = version
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: fr ? `Unveilboard ${version} est disponible.` : `Unveilboard ${version} is available.`,
      detail: fr
        ? 'Téléchargez la nouvelle version et remplacez celle du dossier Applications. Vos schémas sont conservés.'
        : 'Download the new version and replace the one in your Applications folder. Your diagrams are kept.',
      buttons: fr ? ['Télécharger', 'Plus tard'] : ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) void shell.openExternal(RELEASES_URL)
  })

  autoUpdater.on('update-downloaded', async ({ version }) => {
    if (announced === version) return
    announced = version
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: fr ? `Unveilboard ${version} est prête.` : `Unveilboard ${version} is ready.`,
      detail: fr
        ? 'Redémarrez pour l’installer, ou elle le sera à la fermeture de l’application.'
        : 'Restart to install it, or it will be installed when you quit.',
      buttons: fr ? ['Redémarrer', 'Plus tard'] : ['Restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })

  // Hors ligne, dépôt inaccessible… : on réessaiera plus tard, sans déranger l'utilisateur.
  autoUpdater.on('error', (e) => console.warn('Mise à jour :', e?.message ?? e))

  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  void check()
  setInterval(check, CHECK_EVERY)
}

module.exports = { setupUpdates }
