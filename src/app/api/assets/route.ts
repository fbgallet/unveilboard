import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { unauthorized } from '@/lib/session'

// Les fonctions Vercel limitent le corps des requêtes à ~4,5 Mo.
const MAX_BYTES = 4 * 1024 * 1024

/** Téléverse une image vers Vercel Blob et renvoie son URL. 501 si Blob n'est pas configuré. */
export async function POST(request: Request) {
  const denied = await unauthorized()
  if (denied) return denied
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Image storage is not configured' }, { status: 501 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (4 MB max)' }, { status: 413 })

  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'image'
  const blob = await put(`assets/${safeName}`, file, {
    access: 'public',
    addRandomSuffix: true,
    contentType: file.type || undefined,
  })
  return NextResponse.json({ url: blob.url })
}
