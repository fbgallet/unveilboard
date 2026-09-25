import { createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw'
import type { Sequence } from './sequence/types'

// Schéma de démonstration : « La liberté est-elle une illusion ? »

const id = (name: string) => createShapeId(`demo-${name}`)

const S = {
  title: id('title'),
  question: id('question'),
  absence: id('absence'),
  spinoza: id('spinoza'),
  autonomy: id('autonomy'),
  synthesis: id('synthesis'),
  qToAbsence: id('q-absence'),
  qToAutonomy: id('q-autonomy'),
  spinozaToAbsence: id('spinoza-absence'),
  spinozaToSynthesis: id('spinoza-synthesis'),
  autonomyToSynthesis: id('autonomy-synthesis'),
}

type Color = 'black' | 'blue' | 'green' | 'red' | 'violet' | 'orange'

function box(editor: Editor, shapeId: TLShapeId, x: number, y: number, w: number, h: number, text: string, color: Color) {
  editor.createShape({
    id: shapeId,
    type: 'geo',
    x,
    y,
    props: { geo: 'rectangle', w, h, richText: toRichText(text), color, fill: 'semi', font: 'sans', size: 'm' },
  })
}

function arrow(editor: Editor, arrowId: TLShapeId, from: TLShapeId, to: TLShapeId, color: Color, label = '', dash: 'draw' | 'dashed' = 'draw') {
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    props: { color, dash, richText: toRichText(label), font: 'sans', size: 'm' },
  })
  const binding = (terminal: 'start' | 'end', target: TLShapeId) => ({
    type: 'arrow' as const,
    fromId: arrowId,
    toId: target,
    props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' as const },
  })
  editor.createBindings([binding('start', from), binding('end', to)])
}

export function seedDemo(editor: Editor): Sequence {
  editor.run(() => {
    editor.createShape({
      id: S.title,
      type: 'text',
      x: -330,
      y: -300,
      props: { richText: toRichText('La liberté est-elle une illusion ?'), size: 'xl', font: 'serif', autoSize: true },
    })
    box(editor, S.question, -160, -140, 320, 90, 'Être libre, c’est…', 'black')
    box(editor, S.absence, -620, 60, 360, 130, '…faire ce que je veux, sans contrainte extérieure', 'blue')
    box(editor, S.autonomy, 260, 60, 360, 130, '…obéir à la loi qu’on s’est soi-même prescrite (Rousseau)', 'green')
    box(
      editor,
      S.spinoza,
      -620,
      330,
      360,
      190,
      'Spinoza : « les hommes se croient libres parce qu’ils sont conscients de leurs actions et ignorants des causes qui les déterminent »',
      'red'
    )
    box(editor, S.synthesis, -180, 620, 360, 120, 'La liberté comme compréhension de la nécessité ?', 'violet')

    arrow(editor, S.qToAbsence, S.question, S.absence, 'black')
    arrow(editor, S.qToAutonomy, S.question, S.autonomy, 'black')
    arrow(editor, S.spinozaToAbsence, S.spinoza, S.absence, 'red', 'objecte', 'dashed')
    arrow(editor, S.spinozaToSynthesis, S.spinoza, S.synthesis, 'violet')
    arrow(editor, S.autonomyToSynthesis, S.autonomy, S.synthesis, 'violet')
  })

  return {
    id: 'seq_demo',
    title: 'La liberté est-elle une illusion ?',
    steps: [
      {
        id: 'st_1',
        title: 'La question',
        actions: [{ type: 'show', targets: [S.title, S.question], effect: 'fade' }],
        camera: { mode: 'follow' },
        narration:
          'Partons d’une intuition commune. Nous avons tous le **sentiment** d’être libres. Mais que voulons-nous dire exactement par là ?',
      },
      {
        id: 'st_2',
        title: 'Première définition',
        actions: [
          { type: 'show', targets: [S.absence], effect: 'rise' },
          { type: 'show', targets: [S.qToAbsence], effect: 'draw' },
        ],
        camera: { mode: 'follow' },
        narration:
          'La réponse spontanée : être libre, c’est faire ce que l’on veut, **sans obstacle**. La liberté se définit négativement, par l’absence de contrainte.',
      },
      {
        id: 'st_3',
        title: 'L’objection de Spinoza',
        actions: [
          { type: 'show', targets: [S.spinoza], effect: 'fade' },
          { type: 'show', targets: [S.spinozaToAbsence], effect: 'draw' },
          { type: 'focus', targets: [S.spinoza, S.absence, S.spinozaToAbsence] },
        ],
        camera: { mode: 'follow' },
        narration:
          '> Les hommes se croient libres parce qu’ils sont conscients de leurs actions et ignorants des causes qui les déterminent.\n\n*Éthique*, I, appendice. Faire ce que je veux ne prouve pas que je sois libre : encore faut-il savoir **d’où vient** ce que je veux.',
      },
      {
        id: 'st_4',
        title: 'La définition vacille',
        actions: [{ type: 'dim', targets: [S.absence, S.qToAbsence] }],
        camera: { mode: 'overview' },
        narration:
          'La première définition n’est pas réfutée, mais elle est **fragilisée** : elle confond liberté et sentiment de liberté.',
      },
      {
        id: 'st_5',
        title: 'Seconde définition',
        actions: [
          { type: 'show', targets: [S.autonomy], effect: 'rise' },
          { type: 'show', targets: [S.qToAutonomy], effect: 'draw' },
        ],
        camera: { mode: 'follow' },
        narration:
          '« L’obéissance à la loi qu’on s’est prescrite est liberté » (Rousseau, *Du contrat social*, I, 8). Être libre, ce n’est plus l’absence de loi, c’est l’**autonomie**.',
      },
      {
        id: 'st_6',
        title: 'Vers une synthèse',
        actions: [
          { type: 'show', targets: [S.synthesis], effect: 'fade' },
          { type: 'show', targets: [S.spinozaToSynthesis, S.autonomyToSynthesis], effect: 'draw' },
          { type: 'highlight', targets: [S.synthesis] },
        ],
        camera: { mode: 'follow' },
        narration:
          'Les deux critiques convergent : la liberté n’est pas donnée d’emblée, elle se **conquiert** par la connaissance de ce qui nous détermine.',
      },
      {
        id: 'st_7',
        title: 'Vue d’ensemble',
        actions: [{ type: 'undim', targets: [S.absence, S.qToAbsence] }],
        camera: { mode: 'overview' },
        narration: 'Reprenons le chemin parcouru, de l’intuition commune à sa critique.',
      },
    ],
  }
}
