import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { storageMode } from '@/lib/storageMode'
import { kv, kvConfigured } from './kv'

// Partages publics (instance sans base de données) : n'importe quel visiteur peut publier un lien
// court vers une copie de son schéma, contrôlée (src/lib/share/sanitize.ts), limitée en fréquence
// et effacée au bout de 30 jours sans republication. Le mode cloud a sa propre publication (Postgres).

const DAY = 24 * 3600
export const PUBLIC_SHARE_TTL = 30 * DAY
export const PUBLIC_SHARE_MAX_BYTES = 256 * 1024
const LIMITS = { perIpHour: 3, perIpDay: 10, allDay: 200 }
const SHARE_ID = /^[\w-]{16}$/

interface StoredShare {
  title: string
  snapshot: unknown
  ownerKeyHash: string
  publishedAt: string
}

export interface PublicShareInfo {
  id: string
  publishedAt: string
  expiresAt: string
}

/** Publication ouverte à tous : mode local, stockage configuré, et pas d'arrêt d'urgence (SHARING=off). */
export function publicSharingEnabled() {
  return storageMode() === 'local' && kvConfigured() && process.env.SHARING !== 'off'
}

/** Termes refusés en plus de la liste intégrée (SHARE_BLOCKLIST, séparés par des virgules). */
export function extraBlockedTerms() {
  return (process.env.SHARE_BLOCKLIST ?? '').split(',').map((t) => t.trim()).filter(Boolean)
}

/** Compte une publication pour cette adresse ; false si une limite est atteinte. */
export async function allowPublication(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  // Adresse hachée : les compteurs ne gardent pas d'adresse IP en clair.
  const who = createHash('sha256').update(ip).digest('hex').slice(0, 32)
  const hour = Math.floor(Date.now() / 3600_000)
  const day = Math.floor(hour / 24)
  const store = kv()
  const [perHour, perDay, all] = await Promise.all([
    store.incr(`rl:${who}:h${hour}`, 3600),
    store.incr(`rl:${who}:d${day}`, DAY),
    store.incr(`rl:all:d${day}`, DAY),
  ])
  return perHour <= LIMITS.perIpHour && perDay <= LIMITS.perIpDay && all <= LIMITS.allDay
}

export async function createPublicShare(title: string, snapshot: unknown) {
  const id = randomBytes(12).toString('base64url')
  const ownerKey = randomBytes(24).toString('base64url')
  const info = await write(id, { title, snapshot, ownerKeyHash: hash(ownerKey), publishedAt: new Date().toISOString() })
  return { ...info, ownerKey }
}

/** Republie (même lien, délai d'expiration relancé). null : introuvable ou clé de gestion fausse. */
export async function updatePublicShare(id: string, ownerKey: string, title: string, snapshot: unknown) {
  const current = await readOwned(id, ownerKey)
  if (!current) return null
  return write(id, { ...current, title, snapshot, publishedAt: new Date().toISOString() })
}

/** false : introuvable ou clé de gestion fausse. */
export async function deletePublicShare(id: string, ownerKey: string) {
  if (!(await readOwned(id, ownerKey))) return false
  await kv().del(key(id))
  return true
}

export async function getPublicShare(id: string) {
  const share = await read(id)
  return share && { title: share.title, snapshot: share.snapshot }
}

const key = (id: string) => `share:${id}`
const hash = (ownerKey: string) => createHash('sha256').update(ownerKey).digest('hex')

async function write(id: string, share: StoredShare): Promise<PublicShareInfo> {
  await kv().set(key(id), JSON.stringify(share), PUBLIC_SHARE_TTL)
  const expiresAt = new Date(Date.parse(share.publishedAt) + PUBLIC_SHARE_TTL * 1000).toISOString()
  return { id, publishedAt: share.publishedAt, expiresAt }
}

async function read(id: string): Promise<StoredShare | null> {
  if (!SHARE_ID.test(id)) return null
  const raw = await kv().get(key(id))
  return raw ? (JSON.parse(raw) as StoredShare) : null
}

async function readOwned(id: string, ownerKey: string) {
  const share = await read(id)
  if (!share || !ownerKey) return null
  const a = Buffer.from(share.ownerKeyHash, 'hex')
  const b = Buffer.from(hash(ownerKey), 'hex')
  return a.length === b.length && timingSafeEqual(a, b) ? share : null
}
