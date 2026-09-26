'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { documentStore, forgetLocalCache } from '@/lib/storage'
import { importTldrFile, pickTldrFile } from '@/lib/storage/tldrFile'
import type { DocumentSummary, StorageMode } from '@/lib/storage/types'
import { logout } from './login/actions'

const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Liste des schémas, commune aux deux modes de stockage (serveur ou navigateur). */
export function Home({ storage }: { storage: StorageMode }) {
  const store = documentStore(storage)
  const router = useRouter()
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let cancelled = false
    store
      .list()
      .then((list) => !cancelled && setDocs(list))
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
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  const create = (demo: boolean) =>
    run(async () => {
      const id = await store.create(demo ? 'La liberté est-elle une illusion ?' : 'Sans titre')
      router.push(demo ? `/d/${id}?demo=1` : `/d/${id}`)
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
    if (!confirm(`Supprimer « ${doc.title} » ? Cette action est définitive.`)) return
    void run(async () => {
      await store.remove(doc.id)
      forgetLocalCache(doc.id)
      setDocs((list) => list?.filter((d) => d.id !== doc.id) ?? null)
      setBusy(false)
    })
  }

  return (
    <main
      className={`min-h-dvh bg-[#fbfaf7] ${dragging ? 'outline-4 -outline-offset-8 outline-dashed outline-amber-400' : ''}`}
      // Déposer un fichier .tldr n'importe où sur la page l'importe.
      onDragOver={(e) => {
        if (![...e.dataTransfer.items].some((i) => i.kind === 'file')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void importFile(file)
      }}
    >
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <header className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-4xl text-stone-900">Mes schémas</h1>
          {storage === 'cloud' && (
            <form action={logout}>
              <button className="text-sm text-stone-500 hover:text-stone-900">Se déconnecter</button>
            </form>
          )}
        </header>

        {storage === 'local' && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Vos schémas sont enregistrés <strong>dans ce navigateur uniquement</strong>. Pour les sauvegarder ou les
            transférer : « Enregistrer sous… » (panneau des étapes, ou menu ☰) dans un schéma, puis « Ouvrir un fichier .tldr »
            ici, ou glisser le fichier sur cette page.
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => create(false)}>
            + Nouveau schéma
          </button>
          <button className="btn" disabled={busy} onClick={() => create(true)}>
            Créer l&apos;exemple (la liberté)
          </button>
          <button className="btn" disabled={busy} onClick={chooseFile} title="Ou déposez un fichier .tldr sur cette page">
            Ouvrir un fichier .tldr…
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <ul className="mt-8 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {docs?.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-4 px-4 py-3">
              <Link href={`/d/${doc.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-stone-900 group-hover:text-amber-700">{doc.title}</p>
                <p className="text-xs text-stone-500">Modifié le {fmt.format(new Date(doc.updatedAt))}</p>
              </Link>
              <button
                className="rounded px-2 py-1 text-xs text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                onClick={() => remove(doc)}
                disabled={busy}
                title="Supprimer"
              >
                Supprimer
              </button>
            </li>
          ))}
          {docs && !docs.length && (
            <li className="px-4 py-10 text-center text-sm text-stone-500">
              Aucun schéma pour l&apos;instant. Commencez par l&apos;exemple pour voir le principe.
            </li>
          )}
          {!docs && !error && <li className="px-4 py-10 text-center text-sm text-stone-400">Chargement…</li>}
        </ul>
      </div>
    </main>
  )
}
