// Formes masquées en édition (ni affichées, ni sélectionnables) : branches repliées
// et détails repliés. En présentation, c'est la séquence qui décide (classes CSS).

import type { Editor, TLShape } from 'tldraw'
import { boxOfDetail, isDetailOpen } from './details'
import { isHiddenByFold } from './tree'

export function isHiddenInEdit(editor: Editor, shape: TLShape): boolean {
  const box = boxOfDetail(editor, shape.id)
  if (box) {
    const owner = editor.getShape(box)
    return !isDetailOpen(editor, box) || (!!owner && isHiddenByFold(editor, owner))
  }
  return isHiddenByFold(editor, shape)
}
