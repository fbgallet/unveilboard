'use client'

import { useEffect, useState } from 'react'
import { atom, useValue, type Editor, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { addCommonsImage, type TextTarget } from '@/lib/canvas/imageGen'
import { creditOf, searchCommons, type CommonsImage } from '@/lib/images/commons'

/**
 * Boîte « chercher une image » ouverte : pour un élément (`target` : l'image l'illustre), ou en tête
 * d'un texte de la présentation (`text`, image d'ouverture) ; `query` : la recherche proposée.
 */
export interface ImageSearchOpen {
  target?: TLShapeId
  text?: TextTarget
  query: string
}
export const imageSearchAtom = atom<ImageSearchOpen | null>('imageSearch', null)

export function ImageSearchPanel({ editor }: { editor: Editor }) {
  const open = useValue(imageSearchAtom)
  if (!open) return null
  return <ImageSearchView key={JSON.stringify(open)} editor={editor} open={open} />
}

function ImageSearchView({ editor, open }: { editor: Editor; open: ImageSearchOpen }) {
  const t = useT()
  const s = t.imageSearch
  const close = () => imageSearchAtom.set(null)
  const [query, setQuery] = useState(open.query)
  const [results, setResults] = useState<CommonsImage[] | null>(null)
  // Une recherche proposée part tout de suite.
  const [busy, setBusy] = useState(() => !!open.query.trim())
  const [adding, setAdding] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function search(q: string) {
    if (!q.trim()) return
    setFailure(null)
    setBusy(true)
    try {
      setResults(await searchCommons(q.trim()))
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    const q = open.query.trim()
    if (!q) return
    let live = true
    searchCommons(q)
      .then((found) => live && setResults(found))
      .catch((e) => live && setFailure(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [open.query])

  async function add(image: CommonsImage) {
    setFailure(null)
    setAdding(image.page)
    try {
      await addCommonsImage(editor, image, open.text ? { text: open.text } : { near: open.target, illustrates: open.target })
      close()
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t.common.genericError)
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="element-ai" role="dialog" aria-label={s.title} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">{open.text ? s.openingTitle : s.title}</h2>
        <button className="preset-icon" onClick={close} aria-label={t.common.close}>
          ✕
        </button>
      </header>
      <p className="text-xs text-zinc-500">{s.hint}</p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search(query)
        }}
      >
        <input className="preset-input min-w-0 flex-1 py-1 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={s.placeholder} aria-label={s.placeholder} autoFocus />
        <button className="btn-primary" disabled={busy || !query.trim()}>
          {busy ? s.searching : s.search}
        </button>
      </form>
      {results && !results.length && <p className="text-xs text-zinc-500">{s.none}</p>}
      {results && results.length > 0 && (
        <ul className="image-search-grid">
          {results.map((image) => (
            <li key={image.page}>
              <button className="image-search-item" disabled={!!adding} onClick={() => void add(image)} title={[image.title, image.description].filter(Boolean).join(' — ')}>
                {/* Vignettes de Commons : next/image ne s'applique pas. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.thumb} alt={image.title} loading="lazy" />
                <span className="image-search-caption">{adding === image.page ? s.adding : creditOf(image) || image.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {failure && (
        <p className="text-xs text-red-700" role="alert">
          {failure}
        </p>
      )}
    </div>
  )
}
