// Migrations du format de séquence, stocké dans document.meta (hors du schéma tldraw,
// donc hors de ses migrations). Chaque entrée fait passer de la version n à n + 1.

import { SEQUENCE_VERSION, type Sequence } from './types'

/** Actions d'une version antérieure (retirées depuis). */
type LegacyAction = { type: string; targets: string[] }

const migrations: Record<number, (seq: Sequence) => Sequence> = {
  // 1 → 2 : le « détail » d'une boîte devient sa note, affichée dans le panneau de narration.
  // « Déplier le détail » devient « Afficher la note » ; « Replier le détail » disparaît.
  1: (seq) => ({
    ...seq,
    steps: seq.steps.map((step) => ({
      ...step,
      actions: (step.actions as LegacyAction[])
        .filter((a) => a.type !== 'collapse')
        .map((a) => (a.type === 'expand' ? { ...a, type: 'note' } : a)) as Sequence['steps'][number]['actions'],
    })),
  }),
}

export function migrateSequence(raw: Sequence): Sequence {
  let seq = raw
  for (let v = seq.version ?? 1; v < SEQUENCE_VERSION; v++) seq = { ...migrations[v](seq), version: v + 1 }
  return seq
}
