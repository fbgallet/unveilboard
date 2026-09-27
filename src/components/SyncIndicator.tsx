'use client'

import { useValue } from 'tldraw'
import { useT } from '@/i18n/client'
import { storageModeAtom, syncControls, syncStatusAtom, type SyncState } from '@/lib/sync/documentSync'
import { fileActionsAtom, fileLinkAtom, type FileLinkState } from '@/lib/sync/fileSync'

const DOT: Record<SyncState, string> = {
  loading: 'bg-zinc-300',
  saved: 'bg-emerald-500',
  pending: 'bg-amber-400',
  saving: 'bg-amber-400 animate-pulse',
  offline: 'bg-zinc-400',
  conflict: 'bg-red-500',
  error: 'bg-red-500',
}

/** Pastille d'état de la sauvegarde (en ligne, ou dans ce navigateur en mode local). */
export function SyncIndicator() {
  const t = useT()
  const status = useValue(syncStatusAtom)
  const local = useValue(storageModeAtom) === 'local'
  const title = status.message ?? (local ? t.sync.savedLocal : t.sync.savedCloud)
  return (
    <span className="sync-indicator inline-flex items-center gap-1.5 text-xs text-zinc-500" title={title} role="status">
      <span className={`h-2 w-2 rounded-full ${DOT[status.state]}`} />
      {t.sync.states[status.state]}
    </span>
  )
}

/** Bandeau affiché en cas de conflit entre appareils ou d'erreur bloquante. */
export function SyncBanner() {
  const t = useT()
  const status = useValue(syncStatusAtom)
  const controls = useValue(syncControls)
  const local = useValue(storageModeAtom) === 'local'
  if (status.state !== 'conflict' && status.state !== 'error') return null

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-[700] flex max-w-[90%] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm shadow-lg">
      <span className="text-red-700">{status.message}</span>
      {status.state === 'conflict' && controls && (
        <span className="flex gap-2">
          <button className="btn-xs" onClick={controls.reloadFromServer} title={t.sync.keepLocalHint}>
            {local ? t.sync.loadOther : t.sync.loadOnline}
          </button>
          <button className="btn-xs" onClick={controls.overwriteServer}>
            {t.sync.keepMine}
          </button>
        </span>
      )}
      {status.kind === 'auth' && (
        <a className="btn-xs" href={`/login?next=${encodeURIComponent(location.pathname)}`}>
          {t.sync.reconnect}
        </a>
      )}
    </div>
  )
}

const FILE_DOT: Record<FileLinkState, string> = {
  saved: 'bg-emerald-500',
  pending: 'bg-amber-400',
  saving: 'bg-amber-400 animate-pulse',
  permission: 'bg-zinc-400',
  changed: 'bg-red-500',
  error: 'bg-red-500',
}

/**
 * « Enregistrer sous… » ; une fois le schéma lié à un fichier (Chrome, Edge), le nom du fichier
 * et l'état de son enregistrement. Un clic enregistre, ou redonne l'autorisation d'écrire.
 */
export function FileButton() {
  const t = useT()
  const link = useValue(fileLinkAtom)
  const actions = useValue(fileActionsAtom)
  const fail = (e: unknown) => alert(e instanceof Error ? e.message : e)

  if (!link) {
    return (
      <button
        className="rounded px-1.5 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900"
        onClick={() => void actions?.saveAs().catch(fail)}
        title={t.panel.saveAsHint}
      >
        {t.panel.saveAs}
      </button>
    )
  }
  const title =
    link.message ?? (link.state === 'permission' ? t.files.permissionHint(link.name) : t.files.linkedHint(link.name))
  return (
    <button
      className="inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
      onClick={() => void actions?.save().catch(fail)}
      title={title}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${FILE_DOT[link.state]}`} />
      <span className="max-w-[7rem] truncate">{link.state === 'permission' ? t.files.allow : link.name}</span>
    </button>
  )
}

/** Bandeau affiché quand le fichier lié a été modifié ailleurs, ou n'est plus accessible. */
export function FileBanner() {
  const t = useT()
  const link = useValue(fileLinkAtom)
  const actions = useValue(fileActionsAtom)
  if (!actions || (link?.state !== 'changed' && link?.state !== 'error')) return null
  const fail = (e: unknown) => alert(e instanceof Error ? e.message : e)

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-[700] flex max-w-[90%] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm shadow-lg">
      <span className="text-red-700">{link.message}</span>
      <span className="flex gap-2">
        {link.state === 'changed' ? (
          <>
            <button className="btn-xs" onClick={() => void actions.loadFile()}>
              {t.files.loadFile}
            </button>
            <button className="btn-xs" onClick={() => void actions.overwriteFile()}>
              {t.files.keepMine}
            </button>
          </>
        ) : (
          <>
            <button className="btn-xs" onClick={() => void actions.saveAs().catch(fail)}>
              {t.files.saveAs}
            </button>
            <button className="btn-xs" onClick={() => void actions.unlink()}>
              {t.files.unlink}
            </button>
          </>
        )}
      </span>
    </div>
  )
}
