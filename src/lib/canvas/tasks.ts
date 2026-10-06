// Cases à cocher des boîtes (meta.task : « todo » ou « done », champ `task` du format JSON).
// Cochées d'un clic sur le canevas, en édition comme en présentation ; jamais dans un lien
// partagé ou sur l'écran de projection (lecture seule).

import type { Editor, TLShapeId, TLShapePartial } from 'tldraw'
import { TASK_STATES, type TaskState } from '../map/format'

export function taskOf(meta: Record<string, unknown>): TaskState | undefined {
  const task = meta.task as TaskState | undefined
  return task && TASK_STATES.includes(task) ? task : undefined
}

/** Ajoute (non cochée) ou retire une case aux boîtes données. */
export function setTask(editor: Editor, ids: TLShapeId[], task: TaskState | null) {
  const updates = ids
    .map((id) => editor.getShape(id))
    .filter((s) => s?.type === 'geo')
    .map((s) => ({ id: s!.id, type: s!.type, meta: { ...s!.meta, task } }) as TLShapePartial)
  if (!updates.length) return
  editor.markHistoryStoppingPoint('case à cocher')
  editor.updateShapes(updates)
}

/** Coche ou décoche. */
export function toggleTask(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape(id)
  const task = shape && taskOf(shape.meta)
  if (!task || editor.getIsReadonly()) return
  setTask(editor, [id], task === 'done' ? 'todo' : 'done')
}
