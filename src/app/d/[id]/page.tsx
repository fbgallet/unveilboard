import { notFound, redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/session'
import { storageMode } from '@/lib/storageMode'
import { getDocumentVersion } from '@/db/documents'
import StudioLoader from '@/components/StudioLoader'
import { isDemoName } from '@/lib/demoNames'

export default async function DocumentPage({ params, searchParams }: PageProps<'/d/[id]'>) {
  const storage = storageMode()
  const { id } = await params
  const { demo } = await searchParams
  if (storage === 'cloud') {
    if (!(await isAuthenticated())) redirect('/login')
    // Le contenu est chargé côté client (cache local puis serveur) : on vérifie seulement l'existence.
    if (!(await getDocumentVersion(id))) notFound()
  }
  // Clé tldraw lue à l'exécution (et non intégrée au build) : elle peut rester une variable
  // « sensible » sur Vercel, et la changer ne demande pas de redéploiement. Elle n'est pas secrète :
  // tldraw la vérifie dans le navigateur, et elle ne vaut que pour les domaines déclarés.
  const licenseKey = process.env.TLDRAW_LICENSE_KEY || process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY || undefined
  return <StudioLoader docId={id} demo={isDemoName(demo) ? demo : null} storage={storage} licenseKey={licenseKey} />
}
