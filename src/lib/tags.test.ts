import { describe, expect, it } from 'vitest'
import { normalizeTags, snapshotTags, withoutSnapshotTags, withSnapshotTags } from './tags'

describe('étiquettes', () => {
  it('nettoie, dédoublonne sans tenir compte de la casse, ignore le reste', () => {
    expect(normalizeTags(['  Terminale ', 'terminale', 'La   liberté', '', 3, null])).toEqual(['Terminale', 'La liberté'])
    expect(normalizeTags('Terminale')).toEqual([])
  })

  it('lues et écrites dans document.meta d’un instantané, sans toucher au reste', () => {
    const snapshot = { schema: {}, store: { 'document:document': { id: 'document:document', meta: { sequence: { title: 'T' } } } } }
    expect(snapshotTags(snapshot)).toEqual([])
    const tagged = withSnapshotTags(snapshot, ['Terminale'])
    expect(snapshotTags(tagged)).toEqual(['Terminale'])
    expect(tagged.store['document:document'].meta).toEqual({ sequence: { title: 'T' }, tags: ['Terminale'] })
    expect(snapshot.store['document:document'].meta).not.toHaveProperty('tags')
    expect(snapshotTags(null)).toEqual([])
    expect(withoutSnapshotTags(tagged).store['document:document'].meta).toEqual({ sequence: { title: 'T' } })
  })
})
