import { createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw'
import { clientLocale } from '@/i18n/client'
import { applyPresetTo, presetById, setReasoning } from './canvas/presets'
import { addChildWithRelation, getTreeIndex, relayout, setArgumentTree } from './canvas/tree'
import { SEQUENCE_VERSION, type Sequence, type Step } from './sequence/types'

// Schéma d'exemple : une carte d'argument, « Faut-il toujours dire la vérité ? » (Kant et Constant,
// 1797). Construit avec les mêmes fonctions que l'éditeur (relations, types d'éléments, fonctions en
// couleur, modalité, source, type de raisonnement), dans la langue de l'interface.

interface Node {
  text: string
  /** Source : auteur, œuvre. */
  author?: string
  modality?: 'descriptive' | 'prescriptive'
  /** Type d'élément, s'il diffère de celui que donne la relation. */
  type?: string
}

const TEXTS = {
  fr: {
    title: 'Démo : Faut-il toujours dire la vérité ?',
    question: 'Faut-il toujours dire la vérité ?',
    thesis: { text: 'Oui : la véracité est un devoir inconditionnel', author: 'Kant', modality: 'prescriptive' },
    justification: { text: 'Un mensonge ne peut devenir loi universelle : il ruinerait toute confiance dans la parole' },
    belief: { text: 'La valeur morale d’un acte tient à son principe, non à ses conséquences', modality: 'prescriptive' },
    example: { text: 'L’assassin à la porte : même à lui, je ne dois pas mentir', author: 'Kant' },
    objection: { text: 'Dire la vérité n’est un devoir qu’envers ceux qui ont droit à la vérité', author: 'Constant, Des réactions politiques' },
    distinction: {
      text: '« Droit à la vérité » ≠ droit à la véracité : la première expression n’a pas de sens',
      author: 'Kant, D’un prétendu droit de mentir',
      type: 'distinction',
    },
    answer: { text: 'Qui ment répond des conséquences de son mensonge ; qui dit vrai, non', author: 'Kant' },
    steps: [
      ['La question', 'Mentir pour sauver un ami, est-ce encore mal ? En 1797, Benjamin Constant et Kant s’opposent sur ce cas précis.'],
      ['La réponse de Kant', '**Oui, toujours.** Pour Kant, la véracité est un devoir inconditionnel : aucune circonstance ne rend le mensonge permis.'],
      ['Pourquoi ?', 'Une maxime qui autoriserait le mensonge ne peut pas devenir **loi universelle** : si chacun mentait quand cela l’arrange, plus personne ne croirait personne, et la parole donnée perdrait tout sens. Un raisonnement **par l’absurde** : universalisé, le mensonge se détruit lui-même.'],
      ['Ce que cela suppose', 'La thèse repose sur un **présupposé** : la valeur morale d’un acte tient à son **principe**, non à ses conséquences. Le nuage signale une croyance souvent implicite, mais discutable, ici normative.'],
      ['Le cas de l’assassin', '> Un assassin me demande si mon ami, qu’il poursuit, s’est réfugié chez moi.\n\nMême à lui, selon Kant, je ne dois pas mentir.'],
      ['L’objection de Constant', '> Dire la vérité n’est donc un devoir qu’envers ceux qui ont droit à la vérité. Or nul homme n’a droit à la vérité qui nuit à autrui.\n\nBenjamin Constant, *Des réactions politiques* (1797).'],
      ['Une distinction', 'Kant répond d’abord par une **distinction** : parler d’un « droit à la vérité » n’a pas de sens ; on a seulement droit à la **véracité**, à ce que l’autre ne mente pas. L’objection repose sur une confusion. *D’un prétendu droit de mentir par humanité* (1797).'],
      ['Les conséquences', 'Kant maintient sa thèse : si je mens, je deviens responsable de tout ce qui s’ensuit ; si je dis la vérité, ce qui arrive ne m’est pas imputable.'],
      ['Vue d’ensemble', 'Deux morales s’opposent : celle du **devoir** et celle des **conséquences**. La forme de chaque case dit son type, sa couleur sa fonction ; la touche L affiche la légende.'],
    ],
  },
  en: {
    title: 'Demo: Should we always tell the truth?',
    question: 'Should we always tell the truth?',
    thesis: { text: 'Yes: truthfulness is an unconditional duty', author: 'Kant', modality: 'prescriptive' },
    justification: { text: 'A lie cannot become a universal law: it would destroy all trust in what people say' },
    belief: { text: 'The moral worth of an act lies in its principle, not in its consequences', modality: 'prescriptive' },
    example: { text: 'The murderer at the door: even to him, I must not lie', author: 'Kant' },
    objection: { text: 'Telling the truth is a duty only towards those who have a right to the truth', author: 'Constant, On Political Reactions' },
    distinction: {
      text: '“Right to the truth” ≠ right to truthfulness: the first expression is meaningless',
      author: 'Kant, On a Supposed Right to Lie',
      type: 'distinction',
    },
    answer: { text: 'Whoever lies answers for the consequences of the lie; whoever tells the truth does not', author: 'Kant' },
    steps: [
      ['The question', 'Lying to save a friend: is it still wrong? In 1797, Benjamin Constant and Kant disagree on this very case.'],
      ['Kant’s answer', '**Yes, always.** For Kant, truthfulness is an unconditional duty: no circumstance makes lying permissible.'],
      ['Why?', 'A maxim that allowed lying could not become a **universal law**: if everyone lied whenever it suited them, no one would believe anyone, and a given word would mean nothing. A **reductio**: universalised, lying destroys itself.'],
      ['What it presupposes', 'The thesis rests on an **assumption**: the moral worth of an act lies in its **principle**, not in its consequences. The cloud marks a belief that is often implicit, yet debatable; here, a normative one.'],
      ['The murderer at the door', '> A murderer asks me whether my friend, whom he is pursuing, has taken refuge in my house.\n\nEven to him, Kant says, I must not lie.'],
      ['Constant’s objection', '> To tell the truth is therefore a duty only towards those who have a right to the truth. But no one has a right to a truth that harms others.\n\nBenjamin Constant, *On Political Reactions* (1797).'],
      ['A distinction', 'Kant first answers with a **distinction**: to speak of a “right to the truth” is meaningless; one only has a right to **truthfulness**, to not being lied to. The objection rests on a confusion. *On a Supposed Right to Lie from Philanthropy* (1797).'],
      ['The consequences', 'Kant holds his ground: if I lie, I become responsible for everything that follows; if I tell the truth, what happens cannot be imputed to me.'],
      ['Overview', 'Two moralities meet: one of **duty**, one of **consequences**. The shape of each box tells its type, its color its function; press L to show the legend.'],
    ],
  },
}

export function seedTruth(editor: Editor): Sequence {
  const t = clientLocale() === 'fr' ? TEXTS.fr : TEXTS.en
  const root = createShapeId('demo-truth-question')
  const ids: Record<string, { node: TLShapeId; edge?: TLShapeId }> = { question: { node: root } }

  editor.run(
    () => {
      editor.createShape({
        id: root,
        type: 'geo',
        x: 0,
        y: 0,
        props: { w: 300, h: 150, richText: toRichText(t.question), font: 'sans', size: 'm' },
      })
      const question = presetById(editor, 'question')
      if (question) applyPresetTo(editor, question, [editor.getShape(root)!])
      setArgumentTree(editor, root, true)

      // Chaque nœud : relation depuis son parent (sa fonction), puis texte et auteur.
      const add = (key: string, parent: string, relationId: string, node: Node) => {
        const child = addChildWithRelation(editor, ids[parent].node, presetById(editor, relationId) ?? null)
        // Type d'élément propre (ex. : Distinction), la couleur restant celle de la fonction.
        const type = node.type && presetById(editor, node.type)
        if (type) applyPresetTo(editor, type, [editor.getShape(child)!])
        const shape = editor.getShape(child)!
        editor.updateShape({
          id: child,
          type: 'geo',
          props: { richText: toRichText(node.text) },
          meta: { ...shape.meta, ...(node.author && { author: node.author }), ...(node.modality && { modality: node.modality }) },
        })
        ids[key] = { node: child, edge: getTreeIndex(editor).edge.get(child) }
      }
      add('thesis', 'question', 'answers', t.thesis as Node)
      add('justification', 'thesis', 'supports', t.justification)
      add('belief', 'thesis', 'presupposes', t.belief as Node)
      add('example', 'thesis', 'illustrates', t.example)
      add('objection', 'thesis', 'objects', t.objection)
      add('distinction', 'objection', 'refutes', t.distinction)
      add('answer', 'objection', 'answers', t.answer)
      // L'universalisation : un raisonnement par l'absurde (le mensonge universalisé se détruit).
      const justificationEdge = ids.justification.edge
      if (justificationEdge) setReasoning(editor, justificationEdge, 'absurd')

      // Les textes ont changé la hauteur des cases : on replace l'arbre.
      editor.setEditingShape(null)
      editor.selectNone()
      relayout(editor, root, { reset: true })
    },
    { history: 'ignore' }
  )
  // Les fonctions d'arbre posent des points d'historique : l'exemple ne doit pas se défaire avec Ctrl+Z.
  editor.clearHistory()

  const both = (key: string) => [ids[key].node, ...(ids[key].edge ? [ids[key].edge!] : [])]
  const reveal = (key: string): Step['actions'] => [
    { type: 'show', targets: [ids[key].node], effect: 'rise' },
    ...(ids[key].edge ? [{ type: 'show' as const, targets: [ids[key].edge!], effect: 'draw' as const }] : []),
  ]
  const actions: Step['actions'][] = [
    [{ type: 'show', targets: [root], effect: 'fade' }],
    reveal('thesis'),
    reveal('justification'),
    reveal('belief'),
    reveal('example'),
    [...reveal('objection'), { type: 'focus', targets: [...both('thesis'), ...both('objection')] }],
    reveal('distinction'),
    reveal('answer'),
    [],
  ]

  return {
    version: SEQUENCE_VERSION,
    id: 'seq_demo_truth',
    title: t.title,
    steps: t.steps.map(([title, narration], i) => ({
      id: `st_truth_${i + 1}`,
      title,
      narration,
      actions: actions[i],
      camera: { mode: i === 0 || i === t.steps.length - 1 ? 'overview' : 'follow' },
    })),
  }
}
