// Formes masquées en édition (ni affichées, ni sélectionnables) : branches repliées.
// En présentation, c'est la séquence qui décide (classes CSS).

import type { Editor, TLShape } from 'tldraw'
import { isHiddenByFold } from './tree'

export function isHiddenInEdit(editor: Editor, shape: TLShape): boolean {
  return isHiddenByFold(editor, shape)
}
