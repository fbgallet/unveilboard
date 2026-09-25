'use client'

import dynamic from 'next/dynamic'

// tldraw dépend du DOM : pas de rendu serveur.
const Studio = dynamic(() => import('./Studio'), {
  ssr: false,
  loading: () => <div className="flex h-dvh items-center justify-center text-zinc-400">Chargement…</div>,
})

export default function StudioLoader(props: { docId: string; seedDemo: boolean }) {
  return <Studio {...props} />
}
