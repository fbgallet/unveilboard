import { describe, expect, it } from 'vitest'
import type { TLStoreSnapshot } from 'tldraw'
import { decodeShare, encodeShare } from './link'

const snapshot = (store: Record<string, unknown>) => ({ store, schema: { schemaVersion: 2, sequences: {} } }) as unknown as TLStoreSnapshot

describe('lien autonome', () => {
  it('aller-retour sans perte', async () => {
    const snap = snapshot({
      'document:document': { id: 'document:document', typeName: 'document', meta: { sequence: { title: 'Été — « test »' } } },
      'shape:a': { id: 'shape:a', typeName: 'shape', props: { text: 'x'.repeat(5000) } },
    })
    const { fragment, droppedImages } = await encodeShare(snap)
    expect(droppedImages).toBe(0)
    expect(fragment).toMatch(/^v1\.[\w-]+$/)
    // Le texte répétitif se compresse : le lien reste court.
    expect(fragment.length).toBeLessThan(500)
    expect(await decodeShare(fragment)).toEqual(snap)
  })

  it('retire les images intégrées, garde les images en ligne', async () => {
    const { fragment, droppedImages } = await encodeShare(
      snapshot({
        'asset:1': { id: 'asset:1', typeName: 'asset', props: { src: 'data:image/png;base64,AAAA', w: 10 } },
        'asset:2': { id: 'asset:2', typeName: 'asset', props: { src: 'https://example.com/a.png', w: 10 } },
      })
    )
    expect(droppedImages).toBe(1)
    const store = (await decodeShare(fragment))!.store as Record<string, { props: { src: string | null; w: number } }>
    expect(store['asset:1'].props).toEqual({ src: null, w: 10 })
    expect(store['asset:2'].props.src).toBe('https://example.com/a.png')
  })

  it('fragment inconnu ou abîmé : null', async () => {
    expect(await decodeShare('')).toBeNull()
    expect(await decodeShare('v1.pas-du-deflate')).toBeNull()
    expect(await decodeShare('v9.abc')).toBeNull()
  })
})
