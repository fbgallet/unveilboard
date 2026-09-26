import 'server-only'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from './auth'
import { storageMode } from './storageMode'

export async function isAuthenticated() {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
}

/**
 * Garde des routes de données : 501 en mode local (pas de base), 401 sans session.
 * Vérification au plus près des données (le proxy filtre déjà, mais on ne s'y fie pas seul).
 */
export async function unauthorized() {
  if (storageMode() === 'local') return NextResponse.json({ error: 'No server storage (local mode)' }, { status: 501 })
  return (await isAuthenticated()) ? null : NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
}
