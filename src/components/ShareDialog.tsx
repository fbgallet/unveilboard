'use client'

import { useEffect, useMemo, useState } from 'react'
import { atom, getSnapshot, useValue, type Editor } from 'tldraw'
import { withoutSuggestions } from '@/lib/share/suggestions'
import { withoutPrivateMeta } from '@/lib/share/private'
import { sourcesLength } from '@/lib/canvas/source'
import { useLocale, useT } from '@/i18n/client'
import { encodeShare, LONG_LINK_CHARS, withoutEmbeddedImages } from '@/lib/share/link'
import { settingsStore } from '@/lib/storage'
import { QrOverlay } from './QrCode'
import { readSequence } from '@/lib/canvas/adapter'
import { storageModeAtom, syncStatusAtom } from '@/lib/sync/documentSync'

export const shareDialogOpenAtom = atom<boolean>('shareDialogOpen', false)
/** Inclure le texte source dans ce qui est partagé (sinon, seul le schéma l'est). */
const includeSourceAtom = atom<boolean>('shareIncludeSource', false)

/** Ce qui est partagé : le document, sans les suggestions en attente, le plan de l'IA ni (au choix) le texte. */
function sharedSnapshot(editor: Editor) {
  return withoutPrivateMeta(withoutSuggestions(getSnapshot(editor.store).document), { keepSource: includeSourceAtom.get() })
}

/**
 * Partage en lecture seule : lien autonome (le schéma dans l'URL, toute instance) et lien court publié,
 * en mode cloud (copie de la version enregistrée) ou, sur l'instance publique, partage public de 30 jours.
 */
export function ShareDialog({ editor, docId, publicSharing }: { editor: Editor; docId: string; publicSharing: boolean }) {
  const t = useT()
  const open = useValue(shareDialogOpenAtom)
  const cloud = useValue(storageModeAtom) === 'cloud'
  const backend = useMemo(
    () => (cloud ? cloudBackend(docId) : publicSharing ? publicBackend(docId, editor) : null),
    [cloud, publicSharing, docId, editor]
  )
  if (!open) return null
  const close = () => shareDialogOpenAtom.set(false)

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog share-dialog" role="dialog" aria-label={t.share.title}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.share.title}</h2>
          <button className="preset-icon" onClick={close} aria-label={t.common.close}>
            ✕
          </button>
        </div>
        <p className="text-zinc-500">{t.share.readOnly}</p>
        <IncludeSource editor={editor} />
        <LinkSection editor={editor} />
        {backend && (
          <PublishSection
            backend={backend}
            title={cloud ? t.share.publishTitle : t.share.publicTitle}
            intro={cloud ? t.share.publishIntro : t.share.publicIntro}
            docTitle={readSequence(editor)?.title}
          />
        )}
      </div>
    </div>
  )
}

/** Schéma tiré d'un texte : partager aussi le texte, ou seulement le schéma (par défaut). */
function IncludeSource({ editor }: { editor: Editor }) {
  const t = useT()
  const length = useValue('source length', () => sourcesLength(editor), [editor])
  const include = useValue(includeSourceAtom)
  if (!length) return null
  return (
    <label className="grid gap-0.5">
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={include} onChange={(e) => includeSourceAtom.set(e.target.checked)} />
        {t.share.includeSource(length)}
      </span>
      <span className="pl-5 text-zinc-500">{t.share.includeSourceHint}</span>
    </label>
  )
}

function LinkSection({ editor }: { editor: Editor }) {
  const t = useT()
  const [result, setResult] = useState<{ url: string; droppedImages: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setError(null)
    try {
      const { fragment, droppedImages } = await encodeShare(sharedSnapshot(editor))
      setResult({ url: `${location.origin}/p#${fragment}`, droppedImages })
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.genericError)
    }
  }

  return (
    <section className="share-section">
      <h3 className="preset-group-title">{t.share.linkTitle}</h3>
      <p className="text-zinc-500">{t.share.linkIntro}</p>
      {result ? (
        <>
          <CopyField value={result.url} />
          {result.droppedImages > 0 && <p className="text-amber-700">{t.share.droppedImages(result.droppedImages)}</p>}
          {result.url.length > LONG_LINK_CHARS && (
            <p className="text-amber-700">{t.share.longLink(Math.round(result.url.length / 1000))}</p>
          )}
        </>
      ) : (
        <div>
          <button className="btn-primary" onClick={() => void create()}>
            {t.share.createLink}
          </button>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </section>
  )
}

interface PublishedShare {
  id: string
  publishedAt: string
  /** Partage public : effacé à cette date sans nouvelle publication. */
  expiresAt?: string
}

/** Où vit le lien publié : Postgres (mode cloud, session) ou partage public (clé de gestion locale). */
interface PublishBackend {
  load(): Promise<PublishedShare | null>
  publish(current: PublishedShare | null): Promise<PublishedShare>
  unpublish(current: PublishedShare): Promise<void>
}

/** Erreur d'API : son code (error) est traduit par l'interface. */
class ShareError extends Error {}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  if (res.ok) return (res.status === 204 ? null : await res.json()) as T
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  throw new ShareError(body?.error ?? res.statusText)
}

function cloudBackend(docId: string): PublishBackend {
  const api = `/api/documents/${docId}/share`
  return {
    load: async () => (await call<{ share: PublishedShare | null }>(api)).share,
    async publish() {
      // La publication copie la version enregistrée sur le serveur : on attend la fin de l'enregistrement.
      if (!(await waitUntilSaved())) throw new ShareError('not_saved')
      const body = JSON.stringify({ includeSource: includeSourceAtom.get() })
      return (await call<{ share: PublishedShare }>(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })).share
    },
    unpublish: async () => void (await call(api, { method: 'DELETE' })),
  }
}

/** Partage public : la clé de gestion reste dans ce navigateur (réglages locaux), jamais dans le document. */
function publicBackend(docId: string, editor: Editor): PublishBackend {
  const settingKey = `share.${docId}`
  const settings = settingsStore('local')
  type Owned = PublishedShare & { ownerKey: string }
  const owned = async () => {
    const share = await settings.get<Owned>(settingKey)
    return share && (!share.expiresAt || Date.parse(share.expiresAt) > Date.now()) ? share : null
  }
  const body = () => JSON.stringify({ snapshot: withoutEmbeddedImages(sharedSnapshot(editor)).snapshot })
  return {
    load: owned,
    async publish(current) {
      const mine = current && (await owned())
      const { share } = mine
        ? await call<{ share: PublishedShare }>(`/api/public-shares/${mine.id}`, {
            method: 'PUT',
            headers: { 'x-owner-key': mine.ownerKey },
            body: body(),
          }).catch(async (e) => {
            // Expiré ou retiré entre-temps : on publie un nouveau lien.
            if (e instanceof ShareError && e.message === 'not_found') return call<{ share: Owned }>('/api/public-shares', { method: 'POST', body: body() })
            throw e
          })
        : await call<{ share: Owned }>('/api/public-shares', { method: 'POST', body: body() })
      const next = { ownerKey: mine?.ownerKey, ...share } as Owned
      await settings.set(settingKey, next)
      return next
    },
    async unpublish(current) {
      const mine = await owned()
      if (mine) {
        await call(`/api/public-shares/${current.id}`, { method: 'DELETE', headers: { 'x-owner-key': mine.ownerKey } }).catch((e) => {
          if (!(e instanceof ShareError && e.message === 'not_found')) throw e
        })
      }
      await settings.set(settingKey, null)
    },
  }
}

function PublishSection({
  backend,
  title,
  intro,
  docTitle,
}: {
  backend: PublishBackend
  title: string
  intro: string
  /** Titre de la présentation, affiché au-dessus du QR code en grand. */
  docTitle?: string
}) {
  const t = useT()
  const [locale] = useLocale()
  const [share, setShare] = useState<PublishedShare | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const describe = (e: unknown) =>
    e instanceof ShareError
      ? e.message === 'not_saved'
        ? t.share.notSaved
        : (t.share.errors[e.message] ?? e.message)
      : e instanceof Error
        ? e.message
        : t.common.genericError

  useEffect(() => {
    let cancelled = false
    backend
      .load()
      .then((s) => !cancelled && setShare(s))
      .catch((e) => !cancelled && setError(describe(e)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(describe(e))
    } finally {
      setBusy(false)
    }
  }

  const publish = () => run(async () => setShare(await backend.publish(share ?? null)))
  const unpublish = () => {
    if (!share || !confirm(t.share.confirmUnpublish)) return
    void run(async () => {
      await backend.unpublish(share)
      setShare(null)
    })
  }

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'long' })
  return (
    <section className="share-section">
      <h3 className="preset-group-title">{title}</h3>
      <p className="text-zinc-500">{intro}</p>
      {share && (
        <>
          <CopyField value={`${location.origin}/p/${share.id}`} onQr={() => setQrOpen(true)} />
          <p className="text-xs text-zinc-500">
            {t.share.publishedAt(fmt.format(new Date(share.publishedAt)))}
            {share.expiresAt && <> · {t.share.expiresAt(day.format(new Date(share.expiresAt)))}</>}
          </p>
        </>
      )}
      {share !== undefined && (
        <div className="flex flex-wrap gap-2">
          <button className={share ? 'btn' : 'btn-primary'} disabled={busy} onClick={() => void publish()}>
            {share ? t.share.update : t.share.publish}
          </button>
          {share && (
            <button className="btn" disabled={busy} onClick={unpublish}>
              {t.share.unpublish}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {qrOpen && share && (
        <QrOverlay value={`${location.origin}/p/${share.id}`} title={docTitle} onClose={() => setQrOpen(false)} />
      )}
    </section>
  )
}

function CopyField({ value, onQr }: { value: string; onQr?: () => void }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex gap-2">
      <input className="preset-input flex-1 font-mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <button className="btn" onClick={() => void copy().catch(() => {})}>
        {copied ? t.share.copied : t.share.copy}
      </button>
      {onQr && (
        <button className="btn" onClick={onQr} title={t.share.qrHint}>
          {t.share.qr}
        </button>
      )}
    </div>
  )
}

/** true dès que le document est enregistré ; false après ~10 s ou en cas d'erreur. */
async function waitUntilSaved() {
  for (let i = 0; i < 50; i++) {
    const { state } = syncStatusAtom.get()
    if (state === 'saved') return true
    if (state === 'error' || state === 'conflict' || state === 'offline') return false
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}
