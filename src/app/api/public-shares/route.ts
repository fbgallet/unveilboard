import { NextResponse } from 'next/server'
import { createPublicShare } from '@/lib/server/publicShares'
import { readPublication } from './body'

/** POST : publie un schéma (instance publique). Corps : { snapshot }. Renvoie le lien et la clé de gestion. */
export async function POST(request: Request) {
  const publication = await readPublication(request)
  if ('response' in publication) return publication.response
  return NextResponse.json({ share: await createPublicShare(publication.title, publication.snapshot) })
}
