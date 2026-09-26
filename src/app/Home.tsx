'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { documentStore, forgetLocalCache } from '@/lib/storage'
import { importTldrFile, pickTldrFile } from '@/lib/storage/tldrFile'
import type { DocumentSummary, StorageMode } from '@/lib/storage/types'
import { logout } from './login/actions'
import { useLocale, useT } from '@/i18n/client'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { HeroDemo } from '@/components/home/HeroDemo'
import { Features } from '@/components/home/Features'
import { Logo } from '@/components/Logo'

const GITHUB_URL = 'https://github.com/fbgallet/unveilboard'

/**
 * Accueil. Instance publique (mode local) : présentation de l'app, puis les schémas du visiteur.
 * Instance personnelle (mode cloud) : la liste des schémas, sans présentation.
 */
export function Home({ storage }: { storage: StorageMode }) {
  const docs = useDocuments(storage)
  return (
    <main
      className={`min-h-dvh bg-[#fbfaf7] ${docs.dragging ? 'outline-4 -outline-offset-8 outline-dashed outline-amber-400' : ''}`}
      // Déposer un fichier .tldr n'importe où sur la page l'importe.
      {...docs.dropHandlers}
    >
      {storage === 'local' ? <PublicHome docs={docs} /> : <PersonalHome docs={docs} />}
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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let cancelled = false
    store
      .list()
      .then((docs) => !cancelled && setList(docs))
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

  const create = (demo: boolean) =>
    run(async () => {
      // L'exemple suit la langue : la liberté en français, le cycle de l'eau en anglais.
      const example = locale === 'fr' ? 'liberty' : 'water'
      const id = await store.create(demo ? t.home.exampleTitle : t.common.untitled)
      router.push(demo ? `/d/${id}?demo=${example}` : `/d/${id}`)
    })

  const importFile = (file: File) =>
    run(async () => {
      router.push(`/d/${await importTldrFile(store, file)}`)
    })

  const chooseFile = () =>
    void pickTldrFile()
      .then((file) => file && importFile(file))
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
      const file = e.dataTransfer.files[0]
      if (file) void importFile(file)
    },
  }

  return { list, error, busy, dragging, create, chooseFile, remove, dropHandlers }
}

// ---------- Instance publique ----------

function PublicHome({ docs }: { docs: Documents }) {
  const t = useT()
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
          {docs.error && <p className="mt-4 text-sm text-red-600">{docs.error}</p>}
        </div>
        <HeroDemo />
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
          <form action={logout}>
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

function DocumentList({ docs, className = '', showEmpty = false }: { docs: Documents; className?: string; showEmpty?: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <ul className={`divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white ${className}`}>
      {docs.list?.map((doc) => (
        <li key={doc.id} className="group flex items-center gap-4 px-4 py-3">
          <Link href={`/d/${doc.id}`} className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-900 group-hover:text-amber-700">{doc.title}</p>
            <p className="text-xs text-stone-500">{t.home.modified(fmt.format(new Date(doc.updatedAt)))}</p>
          </Link>
          <button
            className="rounded px-2 py-1 text-xs text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
            onClick={() => docs.remove(doc)}
            disabled={docs.busy}
            title={t.common.delete}
          >
            {t.common.delete}
          </button>
        </li>
      ))}
      {showEmpty && docs.list && !docs.list.length && (
        <li className="px-4 py-10 text-center text-sm text-stone-500">{t.home.empty}</li>
      )}
      {!docs.list && !docs.error && <li className="px-4 py-10 text-center text-sm text-stone-400">{t.common.loading}</li>}
    </ul>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
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
