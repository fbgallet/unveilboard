import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Un seul propriétaire pour l'instant ; prêt pour les comptes utilisateurs.
  ownerId: text('owner_id').notNull().default('owner'),
  title: text('title').notNull().default('Sans titre'),
  /** Instantané du document tldraw (TLStoreSnapshot), séquence comprise. */
  snapshot: jsonb('snapshot'),
  /** Incrémentée à chaque sauvegarde : verrouillage optimiste entre appareils. */
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DocumentRow = typeof documents.$inferSelect
