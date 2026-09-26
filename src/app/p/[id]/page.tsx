import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { TLStoreSnapshot } from 'tldraw'
import { getPublishedShare } from '@/db/shares'
import { getPublicShare } from '@/lib/server/publicShares'
import { reportEnabled } from '@/lib/server/report'
import { PublishedViewer } from '@/components/ViewerLoader'
import { tldrawLicenseKey } from '@/lib/licenseKey'
import { storageMode } from '@/lib/storageMode'

// Présentation publiée (mode cloud : Postgres ; instance publique : partage public, 30 jours),
// lisible par quiconque a le lien, sans connexion.

async function load(id: string) {
  return storageMode() === 'cloud' ? getPublishedShare(id) : getPublicShare(id)
}

export async function generateMetadata({ params }: PageProps<'/p/[id]'>): Promise<Metadata> {
  const share = await load((await params).id)
  return { title: share ? `${share.title} · Unveilboard` : 'Unveilboard', robots: { index: false } }
}

export default async function PublishedPage({ params }: PageProps<'/p/[id]'>) {
  const { id } = await params
  const share = await load(id)
  if (!share) notFound()
  return (
    <PublishedViewer
      snapshot={share.snapshot as TLStoreSnapshot}
      licenseKey={tldrawLicenseKey()}
      reportShareId={reportEnabled() ? id : undefined}
    />
  )
}
