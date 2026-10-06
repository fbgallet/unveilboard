'use client'

import { TldrawUiMenuGroup, TldrawUiMenuItem, useEditor, useToasts, useValue } from 'tldraw'
import { useT } from '@/i18n/client'
import { markdownListOf } from '@/lib/canvas/listExport'
import { setTask, taskOf } from '@/lib/canvas/tasks'
import { modeAtom, openElementTab } from '@/lib/presentation/store'
import { noteOf } from '@/lib/canvas/notes'
import { openAssistant } from './MapJsonDialog'

/** Menu contextuel de la sélection : note de l'objet ; pour les boîtes, case à cocher, copie en liste, mise en forme par l'IA. */
export function ElementMenu() {
  const t = useT()
  const editor = useEditor()
  const { addToast } = useToasts()
  const mode = useValue(modeAtom)
  const boxes = useValue('selected boxes', () => editor.getSelectedShapes().filter((s) => s.type === 'geo'), [editor])
  // Un seul objet sélectionné (sa note) : son identifiant, et s'il a déjà une note.
  const single = useValue(
    'single selection',
    () => {
      const shapes = editor.getSelectedShapes()
      return shapes.length === 1 ? { id: shapes[0].id, hasNote: !!noteOf(shapes[0]) } : null
    },
    [editor]
  )
  if (mode !== 'edit' || (!boxes.length && !single)) return null
  const noteItem = single && (
    <TldrawUiMenuItem
      id="element-note"
      label={single.hasNote ? t.panel.showNote : t.panel.addNote}
      readonlyOk
      onSelect={() => openElementTab(single.hasNote ? undefined : single.id)}
    />
  )
  if (!boxes.length) return <TldrawUiMenuGroup id="element">{noteItem}</TldrawUiMenuGroup>
  const allTasks = boxes.every((s) => taskOf(s.meta))

  async function copyList() {
    try {
      await navigator.clipboard.writeText(markdownListOf(editor, boxes.map((s) => s.id)))
      addToast({ title: t.listExport.copied, severity: 'success' })
    } catch (e) {
      addToast({ title: e instanceof Error ? e.message : t.common.genericError, severity: 'error' })
    }
  }

  return (
    <TldrawUiMenuGroup id="element">
      {noteItem}
      <TldrawUiMenuItem
        id="element-task"
        label={allTasks ? t.tasks.remove : t.tasks.add}
        onSelect={() => setTask(editor, boxes.map((s) => s.id), allTasks ? null : 'todo')}
      />
      <TldrawUiMenuItem id="element-copy-list" label={t.listExport.copySelection} readonlyOk onSelect={() => void copyList()} />
      <TldrawUiMenuItem id="element-style-ai" label={t.styleAi.menu} onSelect={() => openAssistant('style')} />
    </TldrawUiMenuGroup>
  )
}
