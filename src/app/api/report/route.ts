import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getPublishedShare } from '@/db/shares'
import { kv } from '@/lib/server/kv'
import { getPublicShare } from '@/lib/server/publicShares'
import { reportEnabled, sendReport } from '@/lib/server/report'
import { storageMode } from '@/lib/storageMode'

const PER_IP_DAY = 5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST : signale un partage. Corps : { shareId, reason, contact?, website? (piège à robots) }. */
export async function POST(request: Request) {
  if (!reportEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  // Champ invisible pour un humain : rempli, c'est un robot. On fait comme si tout allait bien.
  if (body.website) return new NextResponse(null, { status: 204 })

  const shareId = typeof body.shareId === 'string' ? body.shareId : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : ''
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 200) : ''
  if (reason.length < 5) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const who = createHash('sha256').update(ip).digest('hex').slice(0, 32)
  const day = Math.floor(Date.now() / 86_400_000)
  if ((await kv().incr(`rl:report:${who}:d${day}`, 86_400)) > PER_IP_DAY) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const cloud = storageMode() === 'cloud'
  const share = cloud ? await getPublishedShare(shareId) : await getPublicShare(shareId)
  if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const link = new URL(`/p/${shareId}`, request.url).toString()
  const removal = cloud
    ? 'Pour le retirer : ouvrir le document, Partager › Dépublier.'
    : `Pour le retirer : console Upstash, supprimer la clé share:${shareId}.`
  await sendReport(
    `Unveilboard : signalement de /p/${shareId}`,
    [`Partage : ${link}`, `Titre : ${share.title}`, '', 'Motif :', reason, '', `Contact : ${contact || '(non renseigné)'}`, '', removal].join('\n'),
    EMAIL.test(contact) ? contact : undefined
  )
  return new NextResponse(null, { status: 204 })
}
