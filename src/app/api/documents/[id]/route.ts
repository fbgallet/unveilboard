import { NextResponse } from 'next/server'
import { deleteDocument, getDocument, getDocumentVersion, saveDocument } from '@/db/documents'
import { unauthorized } from '@/lib/session'

/** GET : le document complet, ou seulement sa version avec ?meta=1 (vérification légère). */
export async function GET(request: Request, ctx: RouteContext<'/api/documents/[id]'>) {
  const denied = await unauthorized()
  if (denied) return denied
  const { id } = await ctx.params

  if (new URL(request.url).searchParams.has('meta')) {
    const meta = await getDocumentVersion(id)
    return meta ? NextResponse.json(meta) : notFound()
  }
  const doc = await getDocument(id)
  if (!doc) return notFound()
  return NextResponse.json({ id: doc.id, title: doc.title, version: doc.version, snapshot: doc.snapshot })
}

/** PUT : sauvegarde. Corps : { snapshot, title, baseVersion, force? }. 409 si modifié ailleurs. */
export async function PUT(request: Request, ctx: RouteContext<'/api/documents/[id]'>) {
  const denied = await unauthorized()
  if (denied) return denied
  const { id } = await ctx.params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.baseVersion !== 'number' || !body.snapshot) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const result = await saveDocument(id, {
    snapshot: body.snapshot,
    title: typeof body.title === 'string' ? body.title : 'Untitled',
    baseVersion: body.baseVersion,
    force: body.force === true,
  })
  if (result.ok) return NextResponse.json({ version: result.version })
  if (result.reason === 'conflict') {
    return NextResponse.json({ error: 'Modified elsewhere', version: result.version }, { status: 409 })
  }
  return notFound()
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/documents/[id]'>) {
  const denied = await unauthorized()
  if (denied) return denied
  const { id } = await ctx.params
  await deleteDocument(id)
  return new NextResponse(null, { status: 204 })
}

function notFound() {
  return NextResponse.json({ error: 'Document not found' }, { status: 404 })
}
