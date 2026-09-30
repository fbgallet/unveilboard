import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '.'
import { documents, shares } from './schema'
import { withoutSnapshotTags } from '@/lib/tags'
import { withoutPrivateMeta } from '@/lib/share/private'
import { withoutSuggestions } from '@/lib/share/suggestions'

const OWNER = 'owner'
const SHARE_ID = /^[\w-]{16}$/

export interface ShareInfo {
  id: string
  publishedAt: Date
}

export async function getShareOfDocument(documentId: string): Promise<ShareInfo | null> {
  const [row] = await db
    .select({ id: shares.id, publishedAt: shares.publishedAt })
    .from(shares)
    .innerJoin(documents, eq(documents.id, shares.documentId))
    .where(and(eq(shares.documentId, documentId), eq(documents.ownerId, OWNER)))
  return row ?? null
}

/**
 * Publie la dernière version enregistrée du document (ou met à jour la publication, même lien).
 * null : document introuvable ou encore vide.
 */
export async function publishDocument(documentId: string, opts: { keepSource?: boolean } = {}): Promise<ShareInfo | null> {
  const [doc] = await db
    .select({ title: documents.title, snapshot: documents.snapshot })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.ownerId, OWNER)))
  if (!doc?.snapshot) return null
  // Les étiquettes sont un classement privé, les suggestions en attente et le plan de l'IA un travail
  // en cours : pas dans la copie publiée ; le texte source, seulement si l'auteur le demande.
  const snapshot = withoutPrivateMeta(withoutSuggestions(withoutSnapshotTags(doc.snapshot) as { store: Record<string, unknown> }), opts)
  const [row] = await db
    .insert(shares)
    .values({ id: randomBytes(12).toString('base64url'), documentId, title: doc.title, snapshot })
    .onConflictDoUpdate({
      target: shares.documentId,
      set: { title: doc.title, snapshot, publishedAt: sql`now()` },
    })
    .returning({ id: shares.id, publishedAt: shares.publishedAt })
  return row
}

export async function unpublishDocument(documentId: string) {
  await db.delete(shares).where(eq(shares.documentId, documentId))
}

/** Lecture publique (sans connexion) d'une présentation publiée. */
export async function getPublishedShare(id: string) {
  if (!SHARE_ID.test(id)) return null
  const [row] = await db.select({ title: shares.title, snapshot: shares.snapshot }).from(shares).where(eq(shares.id, id))
  return row ?? null
}
