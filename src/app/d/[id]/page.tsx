import { notFound, redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/session'
import { getDocumentVersion } from '@/db/documents'
import StudioLoader from '@/components/StudioLoader'

export default async function DocumentPage({ params, searchParams }: PageProps<'/d/[id]'>) {
  if (!(await isAuthenticated())) redirect('/login')
  const { id } = await params
  const { demo } = await searchParams
  // Le contenu est chargé côté client (cache local puis serveur) : on vérifie seulement l'existence.
  if (!(await getDocumentVersion(id))) notFound()
  return <StudioLoader docId={id} seedDemo={demo === '1'} />
}
