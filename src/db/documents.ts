import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '.'
import { documents } from './schema'

const OWNER = 'owner'

export async function listDocuments() {
  return db
    .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
    .from(documents)
    .where(eq(documents.ownerId, OWNER))
    .orderBy(desc(documents.updatedAt))
}

export async function createDocument(title = 'Untitled', snapshot?: unknown) {
  const [row] = await db
    .insert(documents)
    .values({ title: title.trim().slice(0, 200) || 'Untitled', ownerId: OWNER, snapshot })
    .returning({ id: documents.id })
  return row.id
}

export async function getDocument(id: string) {
  if (!isUuid(id)) return null
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.ownerId, OWNER)))
  return row ?? null
}

export async function getDocumentVersion(id: string) {
  if (!isUuid(id)) return null
  const [row] = await db
    .select({ version: documents.version, updatedAt: documents.updatedAt })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.ownerId, OWNER)))
  return row ?? null
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; version: number }
  | { ok: false; reason: 'not_found' }

/**
 * Sauvegarde avec verrouillage optimiste : n'écrit que si la version en base est celle
 * sur laquelle le client a travaillé (sauf `force`).
 */
export async function saveDocument(
  id: string,
  input: { snapshot: unknown; title: string; baseVersion: number; force?: boolean }
): Promise<SaveResult> {
  if (!isUuid(id)) return { ok: false, reason: 'not_found' }
  const conditions = [eq(documents.id, id), eq(documents.ownerId, OWNER)]
  if (!input.force) conditions.push(eq(documents.version, input.baseVersion))

  const [row] = await db
    .update(documents)
    .set({
      snapshot: input.snapshot,
      title: input.title.trim().slice(0, 200) || 'Untitled',
      version: sql`${documents.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(and(...conditions))
    .returning({ version: documents.version })
  if (row) return { ok: true, version: row.version }

  const current = await getDocumentVersion(id)
  return current ? { ok: false, reason: 'conflict', version: current.version } : { ok: false, reason: 'not_found' }
}

export async function deleteDocument(id: string) {
  if (!isUuid(id)) return
  await db.delete(documents).where(and(eq(documents.id, id), eq(documents.ownerId, OWNER)))
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}
