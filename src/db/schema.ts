import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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

/**
 * Réglages communs à tous les documents d'un propriétaire (ex. : préréglages de styles),
 * sous forme clé → valeur JSON : un nouveau réglage ne demande pas de migration.
 */
export const settings = pgTable(
  'settings',
  {
    ownerId: text('owner_id').notNull().default('owner'),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.key] })]
)

/**
 * Présentations publiées (mode cloud) : une copie figée du document, lisible sans connexion
 * à l'adresse /p/<id>. Un seul lien par document ; republier met à jour la copie, même lien.
 */
export const shares = pgTable('shares', {
  /** Aléatoire et non devinable : c'est lui qui donne accès. */
  id: text('id').primaryKey(),
  documentId: uuid('document_id')
    .notNull()
    .unique()
    .references(() => documents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
})
