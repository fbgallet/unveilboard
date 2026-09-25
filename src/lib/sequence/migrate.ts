// Migrations du format de séquence, stocké dans document.meta (hors du schéma tldraw,
// donc hors de ses migrations). Chaque entrée fait passer de la version n à n + 1.

import { SEQUENCE_VERSION, type Sequence } from './types'

const migrations: Record<number, (seq: Sequence) => Sequence> = {
  // 1: (seq) => ({ ...seq, ... }),
}

export function migrateSequence(raw: Sequence): Sequence {
  let seq = raw
  for (let v = seq.version ?? 1; v < SEQUENCE_VERSION; v++) seq = { ...migrations[v](seq), version: v + 1 }
  return seq
}
