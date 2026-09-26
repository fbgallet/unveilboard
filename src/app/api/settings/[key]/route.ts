import { NextResponse } from 'next/server'
import { getSetting, putSetting } from '@/db/settings'
import { unauthorized } from '@/lib/session'

const KEY = /^[a-z][a-z0-9.-]{0,63}$/

/** GET : valeur d'un réglage commun (null s'il n'existe pas). */
export async function GET(_request: Request, ctx: RouteContext<'/api/settings/[key]'>) {
  const denied = await unauthorized()
  if (denied) return denied
  const { key } = await ctx.params
  if (!KEY.test(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  return NextResponse.json({ value: await getSetting(key) })
}

/** PUT : enregistre un réglage. Corps : { value }. */
export async function PUT(request: Request, ctx: RouteContext<'/api/settings/[key]'>) {
  const denied = await unauthorized()
  if (denied) return denied
  const { key } = await ctx.params
  if (!KEY.test(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('value' in body)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  await putSetting(key, body.value)
  return new NextResponse(null, { status: 204 })
}
