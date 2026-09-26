import { NextResponse } from 'next/server'
import { getDocumentVersion } from '@/db/documents'
import { getShareOfDocument, publishDocument, unpublishDocument } from '@/db/shares'
import { unauthorized } from '@/lib/session'

// Publication d'un document (mode cloud) : GET l'état, PUT publie ou met à jour, DELETE dépublie.
// La lecture d'une présentation publiée, elle, est publique : page /p/[id].

async function guard(ctx: RouteContext<'/api/documents/[id]/share'>) {
  const denied = await unauthorized()
  if (denied) return { denied }
  const { id } = await ctx.params
  // Valide aussi l'identifiant (UUID) avant de le passer aux requêtes.
  if (!(await getDocumentVersion(id))) return { denied: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { id }
}

export async function GET(_request: Request, ctx: RouteContext<'/api/documents/[id]/share'>) {
  const { denied, id } = await guard(ctx)
  if (denied) return denied
  return NextResponse.json({ share: await getShareOfDocument(id) })
}

/** Publie la dernière version enregistrée du document. */
export async function PUT(_request: Request, ctx: RouteContext<'/api/documents/[id]/share'>) {
  const { denied, id } = await guard(ctx)
  if (denied) return denied
  const share = await publishDocument(id)
  if (!share) return NextResponse.json({ error: 'Empty document' }, { status: 409 })
  return NextResponse.json({ share })
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/documents/[id]/share'>) {
  const { denied, id } = await guard(ctx)
  if (denied) return denied
  await unpublishDocument(id)
  return new NextResponse(null, { status: 204 })
}
