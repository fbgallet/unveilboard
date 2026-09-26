import { describe, expect, it } from 'vitest'
import { isBlockedUrl, normalize, sanitizeForPublicShare } from './sanitize'

const doc = (extra: Record<string, unknown> = {}, narration = 'Une étape') => ({
  schema: { schemaVersion: 2, sequences: {} },
  store: {
    'document:document': {
      id: 'document:document',
      typeName: 'document',
      meta: { sequence: { title: ' La liberté ', steps: [{ id: 's1', narration }] } },
    },
    ...extra,
  },
})

const richLink = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'voir', marks: [{ type: 'link', attrs: { href: 'https://x.io' } }, { type: 'bold' }] }] }],
}

describe('sanitizeForPublicShare', () => {
  it('accepte un document Unveilboard et renvoie son titre', () => {
    const r = sanitizeForPublicShare(doc())
    expect(r).toMatchObject({ ok: true, title: 'La liberté' })
  })

  it('retire l’enregistrement « user » (nom de l’auteur)', () => {
    const r = sanitizeForPublicShare(doc({ 'user:u': { id: 'user:u', typeName: 'user', name: 'Fabrice' } }))
    expect(r.ok && r.snapshot.store['user:u']).toBe(undefined)
  })

  it('refuse ce qui n’est pas un document Unveilboard', () => {
    expect(sanitizeForPublicShare(null)).toEqual({ ok: false, reason: 'invalid' })
    expect(sanitizeForPublicShare({ store: {}, schema: {} })).toEqual({ ok: false, reason: 'invalid' })
    expect(sanitizeForPublicShare(doc({ 'x:1': { id: 'x:1', typeName: 'instance' } }))).toEqual({ ok: false, reason: 'invalid' })
    expect(sanitizeForPublicShare(doc({ 'shape:a': { id: 'shape:b', typeName: 'shape' } }))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('retire les liens : propriété url, marques de lien, cartes de site et leurs liaisons', () => {
    const r = sanitizeForPublicShare(
      doc({
        'shape:a': { id: 'shape:a', typeName: 'shape', type: 'geo', props: { url: 'https://evil.io', richText: richLink } },
        'shape:b': { id: 'shape:b', typeName: 'shape', type: 'bookmark', props: { url: 'https://evil.io' } },
        'binding:1': { id: 'binding:1', typeName: 'binding', fromId: 'shape:c', toId: 'shape:b' },
        'asset:bm': { id: 'asset:bm', typeName: 'asset', type: 'bookmark', props: { src: 'https://evil.io' } },
      })
    )
    if (!r.ok) throw new Error(r.reason)
    const a = r.snapshot.store['shape:a'].props!
    expect(a.url).toBe('')
    expect(JSON.stringify(a.richText)).not.toContain('link')
    expect(JSON.stringify(a.richText)).toContain('bold')
    expect(r.snapshot.store['shape:b']).toBeUndefined()
    expect(r.snapshot.store['binding:1']).toBeUndefined()
    expect(r.snapshot.store['asset:bm']).toBeUndefined()
  })

  it('images : retire les intégrées et le http, garde le https propre, refuse une adresse indésirable', () => {
    const img = (src: string) => ({ 'asset:i': { id: 'asset:i', typeName: 'asset', type: 'image', props: { src } } })
    const src = (r: ReturnType<typeof sanitizeForPublicShare>) => (r.ok ? r.snapshot.store['asset:i'].props!.src : r.reason)
    expect(src(sanitizeForPublicShare(doc(img('data:image/png;base64,AAAA'))))).toBeNull()
    expect(src(sanitizeForPublicShare(doc(img('http://example.com/a.png'))))).toBeNull()
    expect(src(sanitizeForPublicShare(doc(img('https://upload.wikimedia.org/a.png'))))).toBe('https://upload.wikimedia.org/a.png')
    expect(src(sanitizeForPublicShare(doc(img('https://freepornsite.com/a.png'))))).toBe('blocked')
    expect(src(sanitizeForPublicShare(doc(img('https://bit.ly/abc'))))).toBe('blocked')
  })

  it('texte : refuse les termes de la liste, sans faux positif sur un vocabulaire de cours', () => {
    expect(sanitizeForPublicShare(doc({}, 'Envoyez votre SEED PHRASE ici')).ok).toBe(false)
    expect(sanitizeForPublicShare(doc({}, 'Heil Hitler')).ok).toBe(false)
    expect(sanitizeForPublicShare(doc({}, 'Le sexe et le genre ; la drogue chez Baudelaire ; la violence d’État ; Sparte')).ok).toBe(true)
    expect(sanitizeForPublicShare(doc({}, 'mot interdit'), ['Mot interdit']).ok).toBe(false)
  })
})

describe('outils', () => {
  it('normalize', () => expect(normalize('  Vérifiez-VOTRE compte ! ')).toBe('verifiez votre compte'))
  it('isBlockedUrl : adresse illisible', () => expect(isBlockedUrl('pas une url', [])).toBe(true))
})
