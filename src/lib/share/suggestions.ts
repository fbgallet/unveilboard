// Suggestions de l'IA en attente (formes marquées meta.suggestion) : elles ne font pas partie du
// schéma tant qu'elles ne sont pas acceptées. Retirées de ce qui est partagé. Code pur.

type Rec = { id: string; typeName: string; fromId?: unknown; toId?: unknown; meta?: Record<string, unknown> }

/** Instantané de document sans les suggestions en attente (ni les liaisons qui les touchent). */
export function withoutSuggestions<S extends { store: Record<string, unknown> }>(snapshot: S): S {
  const records = Object.values(snapshot.store) as Rec[]
  const gone = new Set(records.filter((r) => r.typeName === 'shape' && r.meta?.suggestion).map((r) => r.id))
  if (!gone.size) return snapshot
  const store = Object.fromEntries(
    Object.entries(snapshot.store).filter(([, value]) => {
      const r = value as Rec
      if (gone.has(r.id)) return false
      return !(r.typeName === 'binding' && (gone.has(String(r.fromId)) || gone.has(String(r.toId))))
    })
  )
  return { ...snapshot, store }
}
