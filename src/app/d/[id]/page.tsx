import { notFound, redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/session'
import { storageMode } from '@/lib/storageMode'
import { getDocumentVersion } from '@/db/documents'
import StudioLoader from '@/components/StudioLoader'
import { isDemoName } from '@/lib/demoNames'
import { tldrawLicenseKey } from '@/lib/licenseKey'
import { publicSharingEnabled } from '@/lib/server/publicShares'

export default async function DocumentPage({ params, searchParams }: PageProps<'/d/[id]'>) {
  const storage = storageMode()
  const { id } = await params
  const { demo } = await searchParams
  if (storage === 'cloud') {
    if (!(await isAuthenticated())) redirect('/login')
    // Le contenu est chargé côté client (cache local puis serveur) : on vérifie seulement l'existence.
    if (!(await getDocumentVersion(id))) notFound()
  }
  return (
    <StudioLoader
      docId={id}
      demo={isDemoName(demo) ? demo : null}
      storage={storage}
      licenseKey={tldrawLicenseKey()}
      publicSharing={publicSharingEnabled()}
    />
  )
}
