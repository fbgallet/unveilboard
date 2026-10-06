import { describe, expect, it } from 'vitest'
import { defaultPresets } from '../presets/presets'
import { parseMap } from './check'
import { cleanInline, looksLikeJson, mapToMarkdownList, outlineDepth, outlineToMap, parseOutline, pastedList, type OutlineNode } from './outline'

const presets = defaultPresets({})
const known = {
  types: presets.filter((p) => p.target === 'shape').map((p) => p.id),
  relations: presets.filter((p) => p.target === 'arrow').map((p) => p.id),
}

/** L'arbre en texte indenté, case à cocher comprise, pour comparer d'un coup d'œil. */
const tree = (nodes: OutlineNode[], depth = 0): string[] =>
  nodes.flatMap((n) => [`${'  '.repeat(depth)}${n.task ? `[${n.task}] ` : ''}${n.text}`, ...tree(n.children, depth + 1)])

const roam = `- {{[[TODO]]}} UI
    - {{[[TODO]]}} fold/unfold tout au niveau n
- {{[[TODO]]}} Fonctionalités IA
    - {{[[TODO]]}} bibliothèque de prompts (méthodes)
        - {{[[DONE]]}} presets
        - {{[[TODO]]}} catégories de presets sélectionnables
        - {{[[TODO]]}} prompts personnalisés
        - {{[[TODO]]}} adaptation au type d'action (créer un schéma, sous-branches, à partir d'un texte, etc.)`

describe('import d’un plan', () => {
  it('copie de Roam : plusieurs têtes de liste, cases à cocher', () => {
    const outline = parseOutline(roam)
    expect(tree(outline.roots)).toEqual([
      '[todo] UI',
      '  [todo] fold/unfold tout au niveau n',
      '[todo] Fonctionalités IA',
      '  [todo] bibliothèque de prompts (méthodes)',
      '    [done] presets',
      '    [todo] catégories de presets sélectionnables',
      '    [todo] prompts personnalisés',
      "    [todo] adaptation au type d'action (créer un schéma, sous-branches, à partir d'un texte, etc.)",
    ])
    expect(outlineDepth(outline.roots)).toBe(3)
  })

  it('réunit les têtes de liste sous une racine, ou en fait des arbres séparés', () => {
    const outline = parseOutline(roam)
    const joined = outlineToMap(outline, { joinUnder: 'Projet' })
    expect(joined.elements.filter((e) => !e.parent).map((e) => e.text)).toEqual(['Projet'])
    expect(joined.elements[0].task).toBeUndefined()
    expect(joined.elements[1]).toMatchObject({ text: 'UI', parent: 'n1', task: 'todo' })
    expect(joined.elements.find((e) => e.text === 'presets')?.task).toBe('done')
    const separate = outlineToMap(outline)
    expect(separate.elements.filter((e) => !e.parent).map((e) => e.text)).toEqual(['UI', 'Fonctionalités IA'])
    for (const map of [joined, separate]) {
      const result = parseMap(map, known)
      expect(result.issues).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it('indentation libre : 2 ou 4 espaces, tabulations, listes numérotées', () => {
    expect(tree(parseOutline('1. Un\n  2. Deux\n\t\t- Trois\n  - Quatre\n5) Cinq').roots)).toEqual(['Un', '  Deux', '    Trois', '  Quatre', 'Cinq'])
  })

  it('texte indenté sans puces : une ligne, un élément', () => {
    expect(tree(parseOutline('Liberté\n    Licence\n    Autonomie\n        Kant\nNécessité').roots)).toEqual([
      'Liberté',
      '  Licence',
      '  Autonomie',
      '    Kant',
      'Nécessité',
    ])
  })

  it('Markdown à titres : les titres font l’arbre, les listes s’y rattachent, les paragraphes deviennent des notes', () => {
    const outline = parseOutline(`# La liberté

Un problème classique.

## Définitions
- Licence
- Autonomie
  - au sens de Kant

## Objections
Le **déterminisme**.

\`\`\`
code gardé
\`\`\`
`)
    expect(outline.title).toBe('La liberté')
    expect(tree(outline.roots)).toEqual(['La liberté', '  Définitions', '    Licence', '    Autonomie', '      au sens de Kant', '  Objections'])
    expect(outline.roots[0].note).toBe('Un problème classique.')
    expect(outline.roots[0].children[1].note).toBe('Le **déterminisme**.\n\n```\ncode gardé\n```')
  })

  it('texte avant la liste : note de la racine', () => {
    const outline = parseOutline('Intro du plan.\n\n- A\n- B')
    expect(outline.intro).toBe('Intro du plan.')
    expect(outlineToMap(outline, { joinUnder: 'Racine' }).elements[0]).toMatchObject({ text: 'Racine', note: 'Intro du plan.' })
    expect(outlineToMap(outline).elements[0]).toMatchObject({ text: 'A', note: 'Intro du plan.' })
  })

  it('bloc sur plusieurs lignes : une boîte de plusieurs paragraphes', () => {
    expect(parseOutline('- Première ligne\n  suite du bloc\n- Autre').roots.map((n) => n.text)).toEqual(['Première ligne\nsuite du bloc', 'Autre'])
  })

  it('Logseq : TODO / DONE, propriétés, branche repliée, titre de page', () => {
    const outline = parseOutline('title:: Ma page\n- DONE Écrire\n  collapsed:: true\n  id:: 6512-ab\n\t- LATER Relire')
    expect(outline.title).toBe('Ma page')
    expect(tree(outline.roots)).toEqual(['[done] Écrire', '  [todo] Relire'])
    expect(outline.roots[0].folded).toBe(true)
    expect(outlineToMap(outline).elements[0].folded).toBe(true)
  })

  it('OPML : titre, notes, cases à cocher (Dynalist), HTML et entités', () => {
    const outline = parseOutline(`<?xml version="1.0"?>
<opml version="2.0"><head><title>Plan &amp; notes</title></head><body>
  <outline text="&lt;b&gt;Thèse&lt;/b&gt;" _note="Une note">
    <outline text="Argument [[Kant]]" checkbox="true" checked="true"/>
    <outline text="Objection" />
  </outline>
  <outline text='Autre'/>
</body></opml>`)
    expect(outline.title).toBe('Plan & notes')
    expect(tree(outline.roots)).toEqual(['**Thèse**', '  [done] Argument Kant', '  Objection', 'Autre'])
    expect(outline.roots[0].note).toBe('Une note')
  })

  it('JSON reconnu, pour l’envoyer à l’import JSON', () => {
    expect(looksLikeJson('  { "format": "unveilboard/map" }')).toBe(true)
    expect(looksLikeJson('```json\n{}\n```')).toBe(true)
    expect(looksLikeJson(roam)).toBe(false)
  })
})

describe('syntaxe des outliners', () => {
  it.each([
    ['[[Kant]] et #[[raison pure]]', 'Kant et raison pure'],
    ['voir [la page]([[Critique]]) et [ce bloc](((abc123XYZ)))', 'voir la page et ce bloc'],
    ['référence ((abc123XYZ)) retirée', 'référence retirée'],
    ['{{[[embed]]: ((abc123XYZ))}} vidéo {{[[video]]: https://youtu.be/x}}', 'vidéo https://youtu.be/x'],
    ['__italique__ et ^^surligné^^ et ==aussi==', '*italique* et surligné et aussi'],
    ['[[Page#Titre]] et [[Page|alias]] ![[image.png]]', 'Page et alias'],
    ['Auteur:: Kant', 'Auteur : Kant'],
    ['#tag gardé', '#tag gardé'],
  ])('%s', (raw, text) => {
    expect(cleanInline(raw).text).toBe(text)
  })

  it.each([
    ['{{[[TODO]]}} faire', 'todo'],
    ['{{DONE}} fait', 'done'],
    ['[ ] faire', 'todo'],
    ['[x] fait', 'done'],
    ['TODO faire', 'todo'],
    ['DONE fait', 'done'],
  ] as const)('case à cocher : %s', (raw, task) => {
    expect(cleanInline(raw).task).toBe(task)
  })
})

describe('schéma → liste Markdown', () => {
  it('aller-retour avec l’import : arbre, cases à cocher', () => {
    const map = outlineToMap(parseOutline(roam))
    const list = mapToMarkdownList(map)
    expect(list.split('\n').slice(0, 5)).toEqual([
      '- [ ] UI',
      '    - [ ] fold/unfold tout au niveau n',
      '- [ ] Fonctionalités IA',
      '    - [ ] bibliothèque de prompts (méthodes)',
      '        - [x] presets',
    ])
    expect(tree(parseOutline(list).roots)).toEqual(tree(parseOutline(roam).roots))
  })

  it('seulement les branches choisies ; boîte de plusieurs lignes sur une ligne', () => {
    const map = outlineToMap(parseOutline('- A\n    - B\n        - C\n- D'))
    map.elements[1].text = 'Deux sens :\n- licence\n- autonomie'
    expect(mapToMarkdownList(map, ['n2', 'n3', 'n4'])).toBe('- Deux sens : ; licence ; autonomie\n    - C\n- D')
  })
})

describe('liste collée', () => {
  it('reconnaît une liste, pas un paragraphe', () => {
    expect(pastedList(roam)?.roots.length).toBe(2)
    expect(pastedList('# Titre\n- A')).not.toBeNull()
    expect(pastedList('Une phrase.\nUne autre phrase.')).toBeNull()
    expect(pastedList('- une seule puce')).toBeNull()
    expect(pastedList('{ "format": "unveilboard/map" }')).toBeNull()
  })
})
