import { describe, expect, it } from 'vitest'
import { markdownToRichText, richTextToMarkdown, stripInlineMarkdown } from './markdown'

const round = (md: string) => richTextToMarkdown(markdownToRichText(md))

describe('Markdown des boîtes ↔ texte riche', () => {
  it('texte simple : un paragraphe par ligne', () => {
    expect(markdownToRichText('Une ligne\nUne autre')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Une ligne' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Une autre' }] },
      ],
    })
    expect(markdownToRichText('a\n\nb').content[1]).toEqual({ type: 'paragraph' })
  })

  it('marques en ligne, imbriquées', () => {
    expect(markdownToRichText('La **liberté** est *une illusion*').content[0].content).toEqual([
      { type: 'text', text: 'La ' },
      { type: 'text', text: 'liberté', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' est ' },
      { type: 'text', text: 'une illusion', marks: [{ type: 'italic' }] },
    ])
    expect(markdownToRichText('**très *fort***').content[0].content).toEqual([
      { type: 'text', text: 'très ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'fort', marks: [{ type: 'bold' }, { type: 'italic' }] },
    ])
    expect(markdownToRichText('[Kant](https://fr.wikipedia.org/wiki/Kant) et `code`').content[0].content).toEqual([
      { type: 'text', text: 'Kant', marks: [{ type: 'link', attrs: { href: 'https://fr.wikipedia.org/wiki/Kant' } }] },
      { type: 'text', text: ' et ' },
      { type: 'text', text: 'code', marks: [{ type: 'code' }] },
    ])
  })

  it('listes à puces et numérotées', () => {
    expect(markdownToRichText('Deux sens :\n- **licence**\n- autonomie').content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Deux sens :' }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'licence', marks: [{ type: 'bold' }] }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'autonomie' }] }] },
        ],
      },
    ])
    expect(markdownToRichText('1. un\n2. deux').content[0]).toMatchObject({ type: 'orderedList', attrs: { start: 1 } })
  })

  it('aller-retour sans perte', () => {
    for (const md of [
      'La **liberté** est *une illusion*',
      '**très *fort***',
      'Deux sens :\n- **licence**\n- autonomie',
      '1. un\n2. *deux*',
      'Voir [Kant](https://example.com) et `x`',
      '~~barré~~ et normal',
      '« Droit à la vérité » ≠ droit à la véracité : la première expression n’a pas de sens',
    ]) {
      expect(round(md)).toBe(md)
    }
  })

  it('caractères littéraux : échappés à l’export, rendus tels quels à l’import', () => {
    const doc = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2 * 3 = 6, snake_case, _souligné_, - tiret' }] }] }
    const md = richTextToMarkdown(doc)
    expect(md).toBe('2 \\* 3 = 6, snake_case, \\_souligné\\_, - tiret')
    expect(markdownToRichText(md)).toEqual(doc)
    expect(richTextToMarkdown({ content: [{ type: 'paragraph', content: [{ type: 'text', text: '- pas une liste' }] }] })).toBe('\\- pas une liste')
  })

  it('texte sans marques', () => {
    expect(stripInlineMarkdown('« Le **mensonge** est *un crime* »')).toBe('« Le mensonge est un crime »')
  })
})
