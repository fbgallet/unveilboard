import { describe, expect, it } from 'vitest'
import { withoutPrivateMeta } from './private'

describe('partage : plan et texte source', () => {
  const snapshot = {
    schema: {},
    store: {
      'document:document': { id: 'document:document', meta: { sequence: 1, aiPlan: { plan: 1 }, source: { text: 'Le texte' }, sources: { 'page:a': { text: 'Page A' } } } },
      'shape:a': { id: 'shape:a', meta: {} },
    },
  }
  const metaOf = (s: typeof snapshot) => s.store['document:document'].meta

  it('le plan n’est jamais partagé ; le texte, seulement si l’auteur le choisit', () => {
    expect(metaOf(withoutPrivateMeta(snapshot))).toEqual({ sequence: 1 })
    expect(metaOf(withoutPrivateMeta(snapshot, { keepSource: true }))).toEqual({ sequence: 1, source: { text: 'Le texte' }, sources: { 'page:a': { text: 'Page A' } } })
    expect(snapshot.store['document:document'].meta.aiPlan).toBeDefined() // l'original est intact
  })
})
