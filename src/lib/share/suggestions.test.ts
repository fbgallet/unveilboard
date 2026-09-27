import { describe, expect, it } from 'vitest'
import { withoutSuggestions } from './suggestions'

describe('partage sans les suggestions de l’IA en attente', () => {
  it('retire les formes suggérées et leurs liaisons, garde le reste', () => {
    const snapshot = {
      schema: {},
      store: {
        'shape:a': { id: 'shape:a', typeName: 'shape', meta: {} },
        'shape:b': { id: 'shape:b', typeName: 'shape', meta: { suggestion: { rationale: 'x' } } },
        'shape:arrow': { id: 'shape:arrow', typeName: 'shape', meta: { suggestion: {} } },
        'binding:1': { id: 'binding:1', typeName: 'binding', fromId: 'shape:arrow', toId: 'shape:a' },
        'binding:2': { id: 'binding:2', typeName: 'binding', fromId: 'shape:x', toId: 'shape:a' },
        'shape:c': { id: 'shape:c', typeName: 'shape', meta: { suggestion: null } },
      },
    }
    expect(Object.keys(withoutSuggestions(snapshot).store)).toEqual(['shape:a', 'binding:2', 'shape:c'])
  })
})
