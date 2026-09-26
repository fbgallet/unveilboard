import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getDocumentVersion } from '@/db/documents'
import { ScreenLoader } from '@/components/ScreenLoader'
import { tldrawLicenseKey } from '@/lib/licenseKey'
import { isAuthenticated } from '@/lib/session'
import { storageMode } from '@/lib/storageMode'

export const metadata: Metadata = { title: 'Unveilboard', robots: { index: false } }

/** Fenêtre public du double affichage : mêmes droits que le document (même navigateur, même session). */
export default async function ScreenPage({ params }: PageProps<'/d/[id]/screen'>) {
  const { id } = await params
  if (storageMode() === 'cloud') {
    if (!(await isAuthenticated())) redirect('/login')
    if (!(await getDocumentVersion(id))) notFound()
  }
  return <ScreenLoader docId={id} licenseKey={tldrawLicenseKey()} />
}
