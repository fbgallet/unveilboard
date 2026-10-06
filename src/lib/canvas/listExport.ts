// Le schéma (ou des branches choisies) en liste Markdown indentée, pour un outliner ou un document.

import type { Editor, TLShapeId } from 'tldraw'
import { mapToMarkdownList } from '../map/outline'
import { exportMap } from './mapExport'

/** Liste des branches des boîtes données (par défaut, toute la page). */
export function markdownListOf(editor: Editor, ids?: TLShapeId[]): string {
  const { map, shapes } = exportMap(editor)
  const wanted = ids && new Set<string>(ids)
  const roots = wanted && [...shapes].filter(([, s]) => s.kind === 'element' && wanted.has(s.node)).map(([ref]) => ref)
  return mapToMarkdownList(map, roots?.length ? roots : undefined)
}
