import 'server-only'
import { createHash } from 'node:crypto'
import { kv } from './kv'

// Limites de fréquence par adresse IP (hachée : les compteurs ne gardent pas d'adresse en clair),
// comptées dans le stockage clé → valeur (Upstash, ou mémoire en développement).
// L'adresse vient de X-Forwarded-For : derrière Vercel, elle ne peut pas être falsifiée.

const DAY = 24 * 3600

export interface Limits {
  perIpHour: number
  perIpDay: number
  allDay: number
}

/** Compte une demande de cette adresse ; false si une limite est atteinte. `prefix` sépare les usages. */
export async function withinLimits(request: Request, prefix: string, limits: Limits) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  const who = createHash('sha256').update(ip).digest('hex').slice(0, 32)
  const hour = Math.floor(Date.now() / 3600_000)
  const day = Math.floor(hour / 24)
  const store = kv()
  const [perHour, perDay, all] = await Promise.all([
    store.incr(`${prefix}:${who}:h${hour}`, 3600),
    store.incr(`${prefix}:${who}:d${day}`, DAY),
    store.incr(`${prefix}:all:d${day}`, DAY),
  ])
  return perHour <= limits.perIpHour && perDay <= limits.perIpDay && all <= limits.allDay
}
