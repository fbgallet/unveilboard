'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { TLStoreSnapshot } from 'tldraw'
import { useT } from '@/i18n/client'
import { decodeShare } from '@/lib/share/link'

// tldraw dépend du DOM : pas de rendu serveur.
const Viewer = dynamic(() => import('./Viewer'), { ssr: false, loading: () => <Message loading /> })

/** Lien publié : le document vient du serveur. */
export function PublishedViewer(props: { snapshot: TLStoreSnapshot; licenseKey?: string; reportShareId?: string }) {
  return <Viewer {...props} />
}

/** Lien autonome : le document est dans le fragment de l'URL, lu dans le navigateur seulement. */
export function LinkViewer({ licenseKey }: { licenseKey?: string }) {
  const [shared, setShared] = useState<{ hash: string; snapshot: TLStoreSnapshot | null } | undefined>(undefined)
  useEffect(() => {
    let current = ''
    // Un autre lien collé dans la même page ne change que le fragment : pas de rechargement, on relit.
    const read = () => {
      const hash = location.hash.slice(1)
      current = hash
      void decodeShare(hash).then((snapshot) => hash === current && setShared({ hash, snapshot }))
    }
    read()
    window.addEventListener('hashchange', read)
    return () => {
      current = ''
      window.removeEventListener('hashchange', read)
    }
  }, [])
  if (shared === undefined) return <Message loading />
  if (!shared.snapshot) return <Message />
  // key : nouveau document, nouvel éditeur (tldraw ne lit l'instantané qu'au montage).
  return <Viewer key={shared.hash} snapshot={shared.snapshot} licenseKey={licenseKey} />
}

function Message({ loading = false }: { loading?: boolean }) {
  const t = useT()
  return (
    <div className="site flex h-dvh flex-col items-center justify-center gap-3 px-4 text-center text-sm">
      {loading ? (
        <p className="text-stone-400">{t.common.loading}</p>
      ) : (
        <>
          <p className="text-stone-700">{t.viewer.invalidLink}</p>
          <Link href="/" className="text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-900">
            Unveilboard
          </Link>
        </>
      )}
    </div>
  )
}
