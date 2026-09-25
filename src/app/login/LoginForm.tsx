'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null)
  return (
    <form action={action} className="mt-8 space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-stone-700" htmlFor="password">
        Mot de passe
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        required
        autoComplete="current-password"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full py-2" disabled={pending}>
        {pending ? 'Connexion…' : 'Entrer'}
      </button>
    </form>
  )
}
