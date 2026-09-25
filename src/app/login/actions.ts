'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from '@/lib/auth'

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = String(formData.get('password') ?? '')
  if (!process.env.APP_PASSWORD) return 'APP_PASSWORD n’est pas configuré sur le serveur.'
  if (!(await checkPassword(password))) return 'Mot de passe incorrect.'

  const store = await cookies()
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  const next = String(formData.get('next') ?? '/')
  // Uniquement des chemins internes.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/')
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}
