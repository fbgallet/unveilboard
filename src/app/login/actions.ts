'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from '@/lib/auth'

/** Erreur de connexion, traduite par le formulaire. */
export type LoginError = 'wrongPassword' | 'notConfigured'

export async function login(_prev: LoginError | null, formData: FormData): Promise<LoginError | null> {
  const password = String(formData.get('password') ?? '')
  if (!process.env.APP_PASSWORD) return 'notConfigured'
  if (!(await checkPassword(password))) return 'wrongPassword'

  const store = await cookies()
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  const next = String(formData.get('next') ?? '/')
  // Uniquement des chemins internes (« //hôte » et « /\hôte » mènent ailleurs).
  redirect(/^\/(?![/\\])/.test(next) ? next : '/')
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}
