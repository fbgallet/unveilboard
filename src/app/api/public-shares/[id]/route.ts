import { NextResponse } from 'next/server'
import { deletePublicShare, updatePublicShare } from '@/lib/server/publicShares'
import { readPublication } from '../body'

// Mise à jour et suppression d'un partage public : réservées à qui détient la clé de gestion
// (en-tête x-owner-key), gardée dans le navigateur de l'auteur.

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 })

export async function PUT(request: Request, ctx: RouteContext<'/api/public-shares/[id]'>) {
  const { id } = await ctx.params
  const publication = await readPublication(request)
  if ('response' in publication) return publication.response
  const share = await updatePublicShare(id, request.headers.get('x-owner-key') ?? '', publication.title, publication.snapshot)
  return share ? NextResponse.json({ share }) : notFound()
}

export async function DELETE(request: Request, ctx: RouteContext<'/api/public-shares/[id]'>) {
  const { id } = await ctx.params
  const ok = await deletePublicShare(id, request.headers.get('x-owner-key') ?? '')
  return ok ? new NextResponse(null, { status: 204 }) : notFound()
}
