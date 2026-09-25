'use client'

import { useValue } from 'tldraw'
import { syncControls, syncStatusAtom, type SyncState } from '@/lib/sync/cloudSync'

const LABELS: Record<SyncState, string> = {
  loading: 'Chargement…',
  saved: 'Enregistré',
  pending: 'Modifications…',
  saving: 'Enregistrement…',
  offline: 'Hors ligne',
  conflict: 'Conflit',
  error: 'Erreur',
}

const DOT: Record<SyncState, string> = {
  loading: 'bg-zinc-300',
  saved: 'bg-emerald-500',
  pending: 'bg-amber-400',
  saving: 'bg-amber-400 animate-pulse',
  offline: 'bg-zinc-400',
  conflict: 'bg-red-500',
  error: 'bg-red-500',
}

/** Pastille d'état de la sauvegarde en ligne. */
export function SyncIndicator() {
  const status = useValue(syncStatusAtom)
  return (
    <span className="sync-indicator inline-flex items-center gap-1.5 text-xs text-zinc-500" title={status.message} role="status">
      <span className={`h-2 w-2 rounded-full ${DOT[status.state]}`} />
      {LABELS[status.state]}
    </span>
  )
}

/** Bandeau affiché en cas de conflit entre appareils ou d'erreur bloquante. */
export function SyncBanner() {
  const status = useValue(syncStatusAtom)
  const controls = useValue(syncControls)
  if (status.state !== 'conflict' && status.state !== 'error') return null

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-[700] flex max-w-[90%] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm shadow-lg">
      <span className="text-red-700">{status.message}</span>
      {status.state === 'conflict' && controls && (
        <span className="flex gap-2">
          <button className="btn-xs" onClick={controls.reloadFromServer} title="Vos modifications locales sont sauvegardées dans ce navigateur avant d'être remplacées">
            Charger la version en ligne
          </button>
          <button className="btn-xs" onClick={controls.overwriteServer}>
            Garder la mienne
          </button>
        </span>
      )}
      {status.message?.includes('reconnectez') && (
        <a className="btn-xs" href={`/login?next=${encodeURIComponent(location.pathname)}`}>
          Se reconnecter
        </a>
      )}
    </div>
  )
}
