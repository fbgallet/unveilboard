import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

// Mêmes fichiers .env que Next.js (.env.local en priorité).
loadEnvConfig(process.cwd())

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Migrations : l'URL directe si elle est définie (voir scripts/migrate.mjs).
  dbCredentials: { url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)! },
})
