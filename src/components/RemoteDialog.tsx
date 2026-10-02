'use client'

import { useValue, type Editor } from 'tldraw'
import { useT } from '@/i18n/client'
import { remoteDialogOpenAtom, remoteStatusAtom, startRemote, stopRemote } from '@/lib/remote/host'
import { publicOrigin } from '@/lib/desktop'
import { QrCode } from './QrCode'

/** Erreurs du service de mise en relation (par opposition à l'échec de la connexion directe). */
const SERVICE_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id'])

/** Appairage d'un téléphone : QR code, état de la connexion et diagnostic du chemin réseau. */
export function RemoteDialog({ editor }: { editor: Editor }) {
  const t = useT()
  const open = useValue(remoteDialogOpenAtom)
  const status = useValue(remoteStatusAtom)
  if (!open) return null
  const close = () => remoteDialogOpenAtom.set(false)
  const id = 'id' in status ? status.id : undefined
  const retry = () => {
    stopRemote()
    void startRemote(editor)
  }

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog share-dialog" role="dialog" aria-label={t.remote.button}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.remote.button}</h2>
          <button className="preset-icon" onClick={close} aria-label={t.common.close}>
            ✕
          </button>
        </div>
        <p className="text-zinc-500">{t.remote.intro}</p>
        {id && status.state !== 'failed' && status.state !== 'connected' && (
          <>
            <QrCode value={`${publicOrigin()}/r#${id}`} className="remote-qr mx-auto" />
            {/* Le même lien, à s'envoyer par message si le téléphone ne lit pas le QR code. */}
            <a className="remote-link mx-auto" href={`${publicOrigin()}/r#${id}`} target="_blank" rel="noreferrer">
              {`${new URL(publicOrigin()).host}/r#${id}`}
            </a>
          </>
        )}
        <p className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              status.state === 'connected' ? 'bg-emerald-500' : status.state === 'failed' ? 'bg-red-500' : 'bg-amber-400'
            }`}
          />
          {status.state === 'connected'
            ? `${t.remote.connected} · ${t.remote.kinds[status.kind]}`
            : status.state === 'failed'
              ? SERVICE_ERRORS.has(status.reason)
                ? t.remote.failedService
                : t.remote.failed
              : status.state === 'connecting'
                ? t.remote.connecting
                : status.state === 'waiting'
                  ? t.remote.waiting
                  : t.remote.starting}
        </p>
        {status.state === 'failed' && !SERVICE_ERRORS.has(status.reason) && <p className="text-zinc-500">{t.remote.failedHint}</p>}
        <div className="flex flex-wrap gap-2">
          {status.state === 'failed' && (
            <button className="btn-primary" onClick={retry}>
              {t.remote.retry}
            </button>
          )}
          {status.state !== 'off' && (
            <button className="btn" onClick={stopRemote}>
              {t.remote.stop}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
