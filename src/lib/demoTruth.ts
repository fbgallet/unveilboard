import type { Editor } from 'tldraw'
import { clientLocale } from '@/i18n/client'
import { seedMap } from './canvas/mapImport'
import { MapSchema } from './map/format'
import type { Sequence } from './sequence/types'
import en from './examples/truth.en.json'
import fr from './examples/truth.fr.json'

// Schéma d'exemple : une carte d'argument, « Faut-il toujours dire la vérité ? » (Kant et Constant,
// 1797), dans la langue de l'interface. Décrite au format JSON des schémas (src/lib/map/format.ts)
// et créée par l'import, avec les mêmes fonctions que l'éditeur : c'est aussi le modèle de ce
// qu'une IA doit produire.

export function seedTruth(editor: Editor): Sequence {
  return seedMap(editor, MapSchema.parse(clientLocale() === 'fr' ? fr : en))
}
