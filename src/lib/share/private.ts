// Ce qui ne se partage pas avec un schéma : le plan de l'IA (un outil de travail) et, sauf si
// l'auteur choisit de l'inclure, le texte source (il peut être long, ou ne pas devoir circuler).
// Code pur, pour le navigateur (lien, partage public) comme pour le serveur (publication cloud).

import { DOCUMENT_RECORD_ID } from '../tags'

export function withoutPrivateMeta<T>(snapshot: T, opts: { keepSource?: boolean } = {}): T {
  const s = snapshot as { store?: Record<string, { meta?: Record<string, unknown> }> }
  const doc = s?.store?.[DOCUMENT_RECORD_ID]
  const keys = ['aiPlan', ...(opts.keepSource ? [] : ['source', 'sources'])]
  if (!doc?.meta || !keys.some((k) => k in doc.meta!)) return snapshot
  const meta = { ...doc.meta }
  for (const k of keys) delete meta[k]
  return { ...s, store: { ...s.store, [DOCUMENT_RECORD_ID]: { ...doc, meta } } } as T
}
