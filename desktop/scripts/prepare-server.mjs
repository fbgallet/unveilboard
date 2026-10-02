// Prépare le serveur embarqué dans l'application de bureau : copie le build autonome de Next
// (`NEXT_OUTPUT=standalone pnpm build`, à la racine du dépôt) dans desktop/server, avec les fichiers
// statiques que ce build laisse de côté (.next/static, public).
// Les liens symboliques de pnpm sont remplacés par les fichiers eux-mêmes : electron-builder
// les empaquette mal, et ils ne survivraient pas à toutes les plateformes.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(desktop, '..')
const standalone = join(root, '.next', 'standalone')
const out = join(desktop, 'server')

if (!existsSync(join(standalone, 'server.js'))) {
  console.error('Build autonome introuvable : lancer « NEXT_OUTPUT=standalone pnpm build » à la racine du dépôt.')
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
cpSync(standalone, out, { recursive: true, dereference: true })
cpSync(join(root, '.next', 'static'), join(out, '.next', 'static'), { recursive: true })
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), join(out, 'public'), { recursive: true })
console.log(`Serveur prêt : ${out}`)
