import type { Metadata } from 'next'
import { connection } from 'next/server'
import { LinkViewer } from '@/components/ViewerLoader'
import { tldrawLicenseKey } from '@/lib/licenseKey'

// Le document est dans le fragment (#…), que le serveur ne reçoit jamais : la page est la même pour tous.
export const metadata: Metadata = { robots: { index: false } }

export default async function SharedLinkPage() {
  // Rendu à la requête : la clé tldraw est lue à l'exécution, pas figée au build.
  await connection()
  return <LinkViewer licenseKey={tldrawLicenseKey()} />
}
