// Applique les migrations de drizzle/ avant `next build`, en mode cloud seulement.
// Lit les variables de l'environnement (celles de l'hébergeur), pas .env.local : un `pnpm build`
// en local ne touche donc pas à la base ; `pnpm db:migrate` reste là pour ça.
// Neon : l'URL directe (DATABASE_URL_UNPOOLED, posée par l'intégration Vercel) plutôt que
// l'URL « pooled », dont le pooler en mode transaction ne convient pas aux changements de schéma.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

if (!url || process.env.SKIP_DB_MIGRATE) {
  console.log('Migrations : ignorées (mode local ou SKIP_DB_MIGRATE).')
} else {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await migrate(drizzle(client), { migrationsFolder: 'drizzle' })
    console.log('Migrations : à jour.')
  } finally {
    await client.end()
  }
}
