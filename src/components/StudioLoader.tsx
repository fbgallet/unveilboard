'use client'

import dynamic from 'next/dynamic'
import type { StorageMode } from '@/lib/storage/types'

// tldraw dépend du DOM : pas de rendu serveur.
const Studio = dynamic(() => import('./Studio'), {
  ssr: false,
  loading: () => <div className="flex h-dvh items-center justify-center text-zinc-400">Chargement…</div>,
})

export default function StudioLoader(props: { docId: string; seedDemo: boolean; storage: StorageMode }) {
  return <Studio {...props} />
}
