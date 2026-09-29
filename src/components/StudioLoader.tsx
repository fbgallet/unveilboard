'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import type { StorageMode } from '@/lib/storage/types'
import type { DemoName } from '@/lib/demoNames'
import { useT } from '@/i18n/client'
import { markOpened } from '@/lib/storage/recent'

// tldraw dépend du DOM : pas de rendu serveur.
const Studio = dynamic(() => import('./Studio'), {
  ssr: false,
  loading: () => <Loading />,
})

export default function StudioLoader(props: {
  docId: string
  demo: DemoName | null
  storage: StorageMode
  licenseKey?: string
  publicSharing: boolean
  serverAi: { model: string; models: string[] } | null
}) {
  // Pour « Ouverts récemment », à l'accueil.
  useEffect(() => markOpened(props.docId), [props.docId])
  return <Studio {...props} />
}

function Loading() {
  const t = useT()
  return <div className="flex h-dvh items-center justify-center text-zinc-400">{t.common.loading}</div>
}
