'use client'

import dynamic from 'next/dynamic'
import { useT } from '@/i18n/client'

// tldraw dépend du DOM : pas de rendu serveur.
const ScreenView = dynamic(() => import('./ScreenView'), { ssr: false, loading: () => <Loading /> })

export function ScreenLoader(props: { docId: string; licenseKey?: string }) {
  return <ScreenView {...props} />
}

function Loading() {
  const t = useT()
  return <div className="site flex h-dvh items-center justify-center text-stone-400">{t.common.loading}</div>
}
