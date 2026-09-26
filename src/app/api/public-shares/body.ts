import 'server-only'
import { NextResponse } from 'next/server'
import { sanitizeForPublicShare } from '@/lib/share/sanitize'
import { allowPublication, extraBlockedTerms, PUBLIC_SHARE_MAX_BYTES, publicSharingEnabled } from '@/lib/server/publicShares'

// Contrôles communs à la publication et à la mise à jour d'un partage public.
// Les refus portent un code (error) que l'interface traduit.

const fail = (error: string, status: number) => ({ response: NextResponse.json({ error }, { status }) })

export async function readPublication(request: Request) {
  if (!publicSharingEnabled()) return fail('disabled', 403)
  // Limite de fréquence avant tout contrôle : on ne teste pas le filtre à volonté.
  if (!(await allowPublication(request))) return fail('rate_limited', 429)
  const text = await request.text()
  if (text.length > PUBLIC_SHARE_MAX_BYTES) return fail('too_large', 413)
  let body: { snapshot?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return fail('invalid', 400)
  }
  const result = sanitizeForPublicShare(body?.snapshot, extraBlockedTerms())
  if (!result.ok) return fail(result.reason, result.reason === 'blocked' ? 422 : 400)
  return { title: result.title, snapshot: result.snapshot }
}
