// Après l'assemblage de l'application : copie le serveur Next autonome (desktop/server) dans ses
// ressources. Pas par extraResources : electron-builder y écarte les dossiers node_modules, dont le
// serveur a besoin.
const { cpSync, existsSync } = require('node:fs')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources')
  const server = path.join(__dirname, '..', 'server')
  if (!existsSync(path.join(server, 'server.js'))) throw new Error('desktop/server manquant : lancer « npm run server ».')
  cpSync(server, path.join(resources, 'server'), { recursive: true })
}
