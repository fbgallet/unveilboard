import { NextResponse } from 'next/server'
import { allowMessage, ownerMailEnabled, sendToOwner } from '@/lib/server/report'

const PER_IP_DAY = 5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST : message à l'éditeur du site (page /legal). Corps : { message, contact?, website? (piège à robots) }. */
export async function POST(request: Request) {
  if (!ownerMailEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  if (body.website) return new NextResponse(null, { status: 204 })

  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : ''
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 200) : ''
  if (message.length < 5) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  if (!(await allowMessage(request, 'contact', PER_IP_DAY))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  await sendToOwner(
    'Unveilboard : message du formulaire de contact',
    [message, '', `Contact : ${contact || '(non renseigné)'}`].join('\n'),
    EMAIL.test(contact) ? contact : undefined
  )
  return new NextResponse(null, { status: 204 })
}
