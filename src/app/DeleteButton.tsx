'use client'

import { deleteDocumentAction } from './actions'

export function DeleteButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteDocumentAction}
      onSubmit={(e) => {
        if (!confirm(`Supprimer « ${title} » ? Cette action est définitive.`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        className="rounded px-2 py-1 text-xs text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
        title="Supprimer"
      >
        Supprimer
      </button>
    </form>
  )
}
