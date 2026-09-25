import 'server-only'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// En développement, le rechargement à chaud recrée les modules : on réutilise le pool.
const globalForDb = globalThis as unknown as { pgPool?: Pool }

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Avec Neon, utiliser l'URL « pooled » (-pooler) : les fonctions Vercel ouvrent peu de connexions chacune.
    max: 5,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool

export const db = drizzle(pool, { schema })
