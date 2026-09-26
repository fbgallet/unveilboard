import { NextResponse } from 'next/server'
import { createDocument, listDocuments } from '@/db/documents'
import { unauthorized } from '@/lib/session'

/** GET : liste des documents (sans leur contenu). */
export async function GET() {
  const denied = await unauthorized()
  if (denied) return denied
  const rows = await listDocuments()
  return NextResponse.json({ documents: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) })
}

/** POST : nouveau document. Corps : { title, snapshot? } (snapshot : import d'un fichier .tldr). */
export async function POST(request: Request) {
  const denied = await unauthorized()
  if (denied) return denied
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const title = typeof body.title === 'string' ? body.title : 'Sans titre'
  const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : undefined
  return NextResponse.json({ id: await createDocument(title, snapshot) }, { status: 201 })
}
