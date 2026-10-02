'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useState } from 'react'
import { documentStore, forgetLocalCache } from '@/lib/storage'
import { recentlyOpened } from '@/lib/storage/recent'
import { MAX_TAG_LENGTH, cleanTag, normalizeTags, sameTag } from '@/lib/tags'
import { droppedTldrFile, openTldrFile, pickTldrFile, type PickedFile } from '@/lib/storage/tldrFile'
import type { DocumentSummary, StorageMode } from '@/lib/storage/types'
import { logout } from './login/actions'
import { forgetAiKeys } from '@/lib/ai/client'
import { useLocale, useT } from '@/i18n/client'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { HeroDemo } from '@/components/home/HeroDemo'
import { Features } from '@/components/home/Features'
import type { DemoName } from '@/lib/demoNames'
import { Logo } from '@/components/Logo'
import { isDesktop } from '@/lib/desktop'

const GITHUB_URL = 'https://github.com/fbgallet/unveilboard'
/** Application de bureau : installateurs (dernière version publiée) et guide d'installation. */
const DOWNLOAD_URL = `${GITHUB_URL}/releases/latest`
const desktopGuideUrl = (locale: string) => `${GITHUB_URL}/blob/main/docs/desktop${locale === 'fr' ? '.fr' : ''}.md`

/** Titre des schémas d'exemple : celui de leur séquence, dans leur langue (src/lib/demo.ts, demoTruth.ts). */
function exampleTitle(name: DemoName, locale: string) {
  if (name === 'truth') return locale === 'fr' ? 'Démo : Faut-il toujours dire la vérité ?' : 'Demo: Should we always tell the truth?'
  return name === 'liberty' ? 'Démo : La liberté est-elle une illusion ?' : 'Demo: The water cycle'
}

/**
 * Accueil. Instance publique (mode local) : présentation de l'app, puis les schémas du visiteur.
 * Instance personnelle (mode cloud) : la liste des schémas, sans présentation.
 */
/** legal : l'instance a une page de mentions légales (LEGAL_PUBLISHER). */
export function Home({ storage, legal = false }: { storage: StorageMode; legal?: boolean }) {
  const docs = useDocuments(storage)
  return (
    <main
      className={`site min-h-dvh ${docs.dragging ? 'outline-4 -outline-offset-8 outline-dashed outline-amber-400' : ''}`}
      // Déposer un fichier .tldr n'importe où sur la page l'importe.
      {...docs.dropHandlers}
    >
      {storage === 'local' ? <PublicHome docs={docs} legal={legal} /> : <PersonalHome docs={docs} />}
    </main>
  )
}

type Documents = ReturnType<typeof useDocuments>

function useDocuments(storage: StorageMode) {
  const t = useT()
  const [locale] = useLocale()
  const store = documentStore(storage)
  const router = useRouter()
  const [list, setList] = useState<DocumentSummary[] | null>(null)
  /** Dernière ouverture de chaque schéma dans ce navigateur (pour « Ouverts récemment »). */
  const [opened, setOpened] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let cancelled = false
    store
      .list()
      .then((docs) => {
        if (cancelled) return
        setList(docs)
        setOpened(recentlyOpened())
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [store])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.genericError)
      setBusy(false)
    }
  }

  /** demo : true pour l'exemple de la langue (la liberté en français, le cycle de l'eau en anglais), ou un exemple précis. */
  const create = (demo: boolean | DemoName) =>
    run(async () => {
      const example: DemoName | null = demo === true ? (locale === 'fr' ? 'liberty' : 'water') : demo || null
      const title = example ? exampleTitle(example, locale) : t.common.untitled
      const id = await store.create(title)
      router.push(example ? `/d/${id}?demo=${example}` : `/d/${id}`)
    })

  // Un fichier déjà ouvert rouvre son schéma ; sinon, il est importé (et lié, sur Chrome et Edge).
  const openFile = (picked: PickedFile) =>
    run(async () => {
      router.push(`/d/${await openTldrFile(store, picked)}`)
    })

  const chooseFile = () =>
    void pickTldrFile()
      .then((picked) => picked && openFile(picked))
      .catch((e: Error) => setError(e.message))

  const remove = (doc: DocumentSummary) => {
    if (!confirm(t.home.confirmDelete(doc.title))) return
    void run(async () => {
      await store.remove(doc.id)
      forgetLocalCache(doc.id)
      setList((docs) => docs?.filter((d) => d.id !== doc.id) ?? null)
      setBusy(false)
    })
  }

  /** Étiquettes d'un schéma, remplacées (affichées tout de suite, enregistrées ensuite). */
  const setTags = (doc: DocumentSummary, raw: string[]) => {
    const tags = normalizeTags(raw)
    setList((docs) => docs?.map((d) => (d.id === doc.id ? { ...d, tags } : d)) ?? null)
    store.setTags(doc.id, tags).catch((e: Error) => setError(e.message))
  }

  /** Retire une étiquette de tous les schémas qui la portent (les schémas restent). */
  const removeTagEverywhere = (tag: string) => {
    const tagged = list?.filter((d) => d.tags.some((x) => sameTag(x, tag))) ?? []
    if (!tagged.length || !confirm(t.home.tags.confirmRemoveEverywhere(tag, tagged.length))) return
    for (const doc of tagged) setTags(doc, doc.tags.filter((x) => !sameTag(x, tag)))
  }

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (![...e.dataTransfer.items].some((i) => i.kind === 'file')) return
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      void droppedTldrFile(e.dataTransfer)
        .then((picked) => picked && openFile(picked))
        .catch((err: Error) => setError(err.message))
    },
  }

  return { list, opened, error, busy, dragging, create, chooseFile, remove, setTags, removeTagEverywhere, dropHandlers }
}

// ---------- Instance publique ----------

function PublicHome({ docs, legal }: { docs: Documents; legal: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const l = t.landing
  const hasDocs = !!docs.list?.length

  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Unveilboard">
          <Logo />
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <LocaleSwitcher />
          <a href={GITHUB_URL} className="flex items-center gap-1.5 text-stone-500 hover:text-stone-900">
            <GitHubIcon />
            {l.github}
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 md:grid-cols-[1fr_1.15fr] md:pt-14">
        <div>
          <h1 className="font-serif text-4xl leading-[1.1] text-balance text-stone-900 sm:text-5xl">{l.tagline}</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-stone-600">{l.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <button className="btn-primary px-4 py-2" disabled={docs.busy} onClick={() => docs.create(true)}>
              {l.tryExample}
            </button>
            <button className="btn px-4 py-2" disabled={docs.busy} onClick={() => docs.create(false)}>
              {l.newDiagram}
            </button>
            <button
              className="px-2 py-2 text-sm text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
              disabled={docs.busy}
              onClick={docs.chooseFile}
              title={t.home.openFileHint}
            >
              {l.openFile}
            </button>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-stone-500">
            <LockIcon />
            {l.privacy}
          </p>
          {/* Dans l'application de bureau elle-même, inutile de proposer de l'installer. */}
          {!isDesktop() && (
            <p className="mt-2 flex items-start gap-2 text-sm text-stone-500">
              <DesktopIcon />
              <span>
                {l.desktop.text}{' '}
                <a href={DOWNLOAD_URL} className="underline decoration-stone-300 underline-offset-4 hover:text-stone-900">
                  {l.desktop.download}
                </a>
                {' · '}
                <a href={desktopGuideUrl(locale)} className="underline decoration-stone-300 underline-offset-4 hover:text-stone-900">
                  {l.desktop.guide}
                </a>
              </span>
            </p>
          )}
          {docs.error && <p className="mt-4 text-sm text-red-600">{docs.error}</p>}
        </div>
        <HeroDemo />
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">{l.examples.title}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {(['truth', 'water', 'liberty'] as const).map((name) => (
            <li key={name}>
              <button
                className="example-card"
                disabled={docs.busy}
                onClick={() => docs.create(name)}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-lg text-stone-900">{l.examples.items[name].title}</span>
                  <span className="shrink-0 text-xs text-stone-400">{l.examples.items[name].language}</span>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-stone-600">{l.examples.items[name].text}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {hasDocs && (
        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">{l.yourDiagrams}</h2>
          <DocumentList docs={docs} className="mt-4" />
          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            {t.home.localNotice.before}
            <strong className="font-medium text-stone-700">{t.home.localNotice.strong}</strong>
            {t.home.localNotice.after}
          </p>
        </section>
      )}

      <section className="border-t border-stone-200 bg-white/60">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <Features />
        </div>
      </section>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-stone-500 sm:px-6">
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <a href={GITHUB_URL} className="hover:text-stone-900">
              {l.footer.openSource}
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://tldraw.dev" className="hover:text-stone-900">
              {l.footer.builtWith}
            </a>
            {legal && (
              <>
                <span aria-hidden="true">·</span>
                <Link href="/legal" className="hover:text-stone-900">
                  {t.legal.link}
                </Link>
              </>
            )}
          </span>
          <span>{l.footer.notAffiliated}</span>
        </div>
      </footer>
    </>
  )
}

// ---------- Instance personnelle ----------

function PersonalHome({ docs }: { docs: Documents }) {
  const t = useT()
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-4xl text-stone-900">{t.home.title}</h1>
        <div className="flex items-center gap-4">
          <LocaleSwitcher />
          <form action={logout} onSubmit={forgetAiKeys}>
            <button className="text-sm text-stone-500 hover:text-stone-900">{t.home.logout}</button>
          </form>
        </div>
      </header>

      <div className="mt-8 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={docs.busy} onClick={() => docs.create(false)}>
          {t.home.newDiagram}
        </button>
        <button className="btn" disabled={docs.busy} onClick={() => docs.create(true)}>
          {t.home.createExample}
        </button>
        <button className="btn" disabled={docs.busy} onClick={docs.chooseFile} title={t.home.openFileHint}>
          {t.home.openFile}
        </button>
      </div>

      {docs.error && <p className="mt-4 text-sm text-red-600">{docs.error}</p>}
      <DocumentList docs={docs} className="mt-8" showEmpty />
    </div>
  )
}

// ---------- Commun ----------

/** Au-delà de ce nombre de schémas : « Ouverts récemment » et recherche. */
const MANY_DOCS = 5
const RECENT_COUNT = 3

/** Texte comparable : sans casse ni accents. */
const searchable = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function DocumentList({ docs, className = '', showEmpty = false }: { docs: Documents; className?: string; showEmpty?: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string[]>([])
  const { opened } = docs

  const all = useMemo(() => [...(docs.list ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [docs.list])
  const many = all.length > MANY_DOCS
  const recent = useMemo(
    () =>
      all
        .filter((d) => opened[d.id])
        .sort((a, b) => opened[b.id] - opened[a.id])
        .slice(0, RECENT_COUNT),
    [all, opened]
  )
  const tags = useMemo(() => allTags(all, locale), [all, locale])
  // Étiquette supprimée entre-temps : elle ne filtre plus.
  const active = filter.filter((f) => tags.some((x) => sameTag(x, f)))
  const q = searchable(query.trim())
  const shown = all.filter(
    (d) =>
      active.every((f) => d.tags.some((x) => sameTag(x, f))) &&
      (!q || searchable([d.title, ...d.tags].join(' ')).includes(q))
  )
  const toggle = (tag: string) =>
    setFilter((f) => (f.some((x) => sameTag(x, tag)) ? f.filter((x) => !sameTag(x, tag)) : [...f, tag]))

  if (!many) return <DocumentRows docs={docs} list={docs.list} tags={tags} className={className} showEmpty={showEmpty} />
  return (
    <div className={className}>
      {recent.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-medium text-stone-500">{t.home.recent}</h3>
          <DocumentRows docs={docs} list={recent} tags={tags} className="mb-6" />
        </>
      )}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-xs font-medium text-stone-500">{t.home.all}</h3>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.home.search}
          aria-label={t.home.search}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 sm:w-64"
        />
      </div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={t.home.tags.filter}>
          <button className={`tag-chip ${active.length ? '' : 'tag-chip-on'}`} onClick={() => setFilter([])}>
            {t.home.tags.clear}
          </button>
          {tags.map((tag) => {
            const on = active.some((f) => sameTag(f, tag))
            return (
              <span key={tag} className={`tag-chip group/tag ${on ? 'tag-chip-on' : ''}`}>
                <button onClick={() => toggle(tag)} aria-pressed={on}>
                  {tag}
                </button>
                <button
                  className="tag-chip-x opacity-0 focus:opacity-100 group-hover/tag:opacity-100"
                  onClick={() => docs.removeTagEverywhere(tag)}
                  title={t.home.tags.removeEverywhere(tag)}
                  aria-label={t.home.tags.removeEverywhere(tag)}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
      {shown.length ? (
        <DocumentRows docs={docs} list={shown} tags={tags} />
      ) : (
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
          {t.home.noMatch([query.trim(), ...active].filter(Boolean).join(' · '))}
        </p>
      )}
    </div>
  )
}

/** Toutes les étiquettes employées, une fois chacune, par ordre alphabétique. */
function allTags(docs: DocumentSummary[], locale: string) {
  const out: string[] = []
  for (const d of docs) for (const tag of d.tags) if (!out.some((x) => sameTag(x, tag))) out.push(tag)
  return out.sort((a, b) => a.localeCompare(b, locale, { sensitivity: 'base' }))
}

function DocumentRows({
  docs,
  list,
  tags,
  className = '',
  showEmpty = false,
}: {
  docs: Documents
  list: DocumentSummary[] | null
  /** Étiquettes déjà employées : proposées à la saisie. */
  tags: string[]
  className?: string
  showEmpty?: boolean
}) {
  const t = useT()
  const [locale] = useLocale()
  const [editing, setEditing] = useState<string | null>(null)
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <ul className={`divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white ${className}`}>
      {list?.map((doc) => (
        <li key={doc.id} className="group px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href={`/d/${doc.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium text-stone-900 group-hover:text-amber-700">{doc.title}</p>
              <p className="text-xs text-stone-500">{t.home.modified(fmt.format(new Date(doc.updatedAt)))}</p>
            </Link>
            {editing !== doc.id && doc.tags.length > 0 && (
              <span className="hidden max-w-[45%] flex-wrap justify-end gap-1 sm:flex">
                {doc.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                  </span>
                ))}
              </span>
            )}
            <span className="flex shrink-0 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
              <button
                className="rounded px-2 py-1 text-xs text-stone-400 hover:bg-amber-50 hover:text-amber-700"
                onClick={() => setEditing(editing === doc.id ? null : doc.id)}
                aria-expanded={editing === doc.id}
                title={t.home.tags.editHint}
              >
                {t.home.tags.edit}
              </button>
              <button
                className="rounded px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => docs.remove(doc)}
                disabled={docs.busy}
                title={t.common.delete}
              >
                {t.common.delete}
              </button>
            </span>
          </div>
          {/* Petit écran : les étiquettes sous le titre. */}
          {editing !== doc.id && doc.tags.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1 sm:hidden">
              {doc.tags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                </span>
              ))}
            </span>
          )}
          {editing === doc.id && (
            <TagEditor
              tags={doc.tags}
              known={tags}
              onChange={(next) => docs.setTags(doc, next)}
              onDone={() => setEditing(null)}
            />
          )}
        </li>
      ))}
      {showEmpty && list && !list.length && (
        <li className="px-4 py-10 text-center text-sm text-stone-500">{t.home.empty}</li>
      )}
      {!list && !docs.error && <li className="px-4 py-10 text-center text-sm text-stone-400">{t.common.loading}</li>}
    </ul>
  )
}

/** Étiquettes d'un schéma : retirer (×), ajouter (Entrée ou virgule), avec les étiquettes connues proposées. */
function TagEditor({
  tags,
  known,
  onChange,
  onDone,
}: {
  tags: string[]
  known: string[]
  onChange: (tags: string[]) => void
  onDone: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const listId = useId()
  const add = () => {
    const tag = cleanTag(draft)
    setDraft('')
    if (!tag || tags.some((x) => sameTag(x, tag))) return
    // Même casse qu'une étiquette déjà employée ailleurs : « terminale » rejoint « Terminale ».
    onChange([...tags, known.find((x) => sameTag(x, tag)) ?? tag])
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip tag-chip-on">
          {tag}
          <button
            className="tag-chip-x"
            onClick={() => onChange(tags.filter((x) => x !== tag))}
            title={t.home.tags.remove(tag)}
            aria-label={t.home.tags.remove(tag)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        autoFocus
        value={draft}
        maxLength={MAX_TAG_LENGTH}
        list={listId}
        onChange={(e) => setDraft(e.target.value.replace(',', ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            if (draft.trim()) add()
            else if (e.key === 'Enter') onDone()
          } else if (e.key === 'Escape') onDone()
          else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
        }}
        placeholder={t.home.tags.add}
        aria-label={t.home.tags.add}
        className="min-w-40 flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      />
      <datalist id={listId}>
        {known
          .filter((k) => !tags.some((x) => sameTag(x, k)))
          .map((k) => (
            <option key={k} value={k} />
          ))}
      </datalist>
      <button
        className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        onClick={() => {
          if (draft.trim()) add()
          onDone()
        }}
      >
        {t.home.tags.done}
      </button>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function DesktopIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="3" width="12" height="8" rx="1.5" />
      <path d="M6 14h4M8 11v3" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  )
}
