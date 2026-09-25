import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/session'
import { listDocuments } from '@/db/documents'
import { logout } from './login/actions'
import { createDocumentAction } from './actions'
import { DeleteButton } from './DeleteButton'

export default async function Home() {
  // Lecture du cookie : rend aussi la page dynamique (jamais prérendue au build).
  if (!(await isAuthenticated())) redirect('/login')
  const docs = await listDocuments()
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <main className="min-h-dvh bg-[#fbfaf7]">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <header className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-4xl text-stone-900">Mes schémas</h1>
          <form action={logout}>
            <button className="text-sm text-stone-500 hover:text-stone-900">Se déconnecter</button>
          </form>
        </header>

        <div className="mt-8 flex flex-wrap gap-2">
          <form action={createDocumentAction}>
            <button className="btn-primary">+ Nouveau schéma</button>
          </form>
          <form action={createDocumentAction}>
            <input type="hidden" name="demo" value="1" />
            <button className="btn">Créer l&apos;exemple (la liberté)</button>
          </form>
        </div>

        <ul className="mt-8 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {docs.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-4 px-4 py-3">
              <Link href={`/d/${doc.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-stone-900 group-hover:text-amber-700">{doc.title}</p>
                <p className="text-xs text-stone-500">Modifié le {fmt.format(doc.updatedAt)}</p>
              </Link>
              <DeleteButton id={doc.id} title={doc.title} />
            </li>
          ))}
          {!docs.length && (
            <li className="px-4 py-10 text-center text-sm text-stone-500">
              Aucun schéma pour l&apos;instant. Commencez par l&apos;exemple pour voir le principe.
            </li>
          )}
        </ul>
      </div>
    </main>
  )
}
