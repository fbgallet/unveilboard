import 'server-only'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from './auth'

export async function isAuthenticated() {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
}

/** Vérification au plus près des données (le proxy filtre déjà, mais on ne s'y fie pas seul). */
export async function unauthorized() {
  return (await isAuthenticated()) ? null : NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
}
