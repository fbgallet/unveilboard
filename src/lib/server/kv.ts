import 'server-only'

// Stockage clé → valeur pour les partages publics : Upstash Redis (API REST, sans dépendance),
// configuré par l'intégration Vercel (KV_REST_API_URL / KV_REST_API_TOKEN) ou directement
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Indépendant de DATABASE_URL : l'instance
// publique reste en mode local. En développement sans Upstash : mémoire du processus.

export interface Kv {
  get(key: string): Promise<string | null>
  /** ttl en secondes. */
  set(key: string, value: string, ttl: number): Promise<void>
  del(key: string): Promise<void>
  /** Incrémente un compteur ; le délai d'expiration est posé à sa création. */
  incr(key: string, ttl: number): Promise<number>
}

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

export function kvConfigured() {
  return !!(url() && token()) || process.env.NODE_ENV === 'development'
}

export function kv(): Kv {
  return url() && token() ? upstash : memory
}

async function pipeline(commands: (string | number)[][]) {
  const res = await fetch(`${url()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Upstash ${res.status}`)
  const results = (await res.json()) as { result?: unknown; error?: string }[]
  const failed = results.find((r) => r.error)
  if (failed) throw new Error(`Upstash: ${failed.error}`)
  return results.map((r) => r.result)
}

const upstash: Kv = {
  async get(key) {
    const [value] = await pipeline([['GET', key]])
    return (value as string | null) ?? null
  },
  async set(key, value, ttl) {
    await pipeline([['SET', key, value, 'EX', ttl]])
  },
  async del(key) {
    await pipeline([['DEL', key]])
  },
  async incr(key, ttl) {
    const count = Number((await pipeline([['INCR', key]]))[0])
    if (count === 1) await pipeline([['EXPIRE', key, ttl]])
    return count
  },
}

// Sur globalThis : en développement, routes d'API et pages sont compilées à part et auraient chacune leur copie.
const store: Map<string, { value: string; until: number }> = ((globalThis as { __unveilboardKv?: Map<string, { value: string; until: number }> }).__unveilboardKv ??= new Map())
const alive = (key: string) => {
  const entry = store.get(key)
  if (entry && entry.until < Date.now()) store.delete(key)
  return store.get(key)
}
const memory: Kv = {
  async get(key) {
    return alive(key)?.value ?? null
  },
  async set(key, value, ttl) {
    store.set(key, { value, until: Date.now() + ttl * 1000 })
  },
  async del(key) {
    store.delete(key)
  },
  async incr(key, ttl) {
    const entry = alive(key)
    const next = Number(entry?.value ?? 0) + 1
    store.set(key, { value: String(next), until: entry?.until ?? Date.now() + ttl * 1000 })
    return next
  },
}
