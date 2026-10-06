'use client'

import { atom, defaultHandleExternalTextContent, useValue, type Editor, type TLRichText, type TLShapeId, type TLShapePartial } from 'tldraw'
import { useT } from '@/i18n/client'
import { addMapAt, addMapUnder, branchTarget } from '@/lib/canvas/assistant'
import { markdownToRichText, type RichNode } from '@/lib/map/markdown'
import { mapToMarkdownList, outlineToMap, pastedList, type Outline } from '@/lib/map/outline'

/**
 * Liste collée sur une boîte (en cours d'édition, ou seule sélectionnée) : la coller comme texte,
 * ou en faire des branches de la boîte. Sur le canevas, une liste devient directement une carte mentale.
 */
interface PendingPaste {
  outline: Outline
  target: TLShapeId
  /** Collée pendant l'édition du texte de la boîte. */
  editing: boolean
}

const pendingPasteAtom = atom<PendingPaste | null>('pendingPaste', null)

/** Collage des listes : sur le canevas (gestionnaire de tldraw) et dans le texte d'une boîte. Renvoie la fonction qui l'arrête. */
export function registerListPaste(editor: Editor) {
  editor.registerExternalContentHandler('text', async (content) => {
    const outline = pastedOutline(content)
    if (!outline || editor.getIsReadonly()) return defaultHandleExternalTextContent(editor, content)
    const target = branchTarget(editor)
    if (target) return void pendingPasteAtom.set({ outline, target, editing: false })
    addMapAt(editor, outlineToMap(outline), content.point ?? editor.getViewportPageBounds().center)
  })

  // Dans le texte d'une boîte, le collage revient à l'éditeur de texte riche : on le devance.
  const onPaste = (e: ClipboardEvent) => {
    const editing = editor.getEditingShape()
    if (editing?.type !== 'geo' || editing.meta.suggestion) return
    const data = e.clipboardData
    const outline = data && pastedOutline({ text: '', sources: ['text', 'html'].map((subtype) => ({ type: 'text', subtype, data: data.getData(`text/${subtype === 'text' ? 'plain' : 'html'}`) })) })
    if (!outline) return
    e.preventDefault()
    e.stopPropagation()
    pendingPasteAtom.set({ outline, target: editing.id, editing: true })
  }
  window.addEventListener('paste', onPaste, true)
  return () => {
    window.removeEventListener('paste', onPaste, true)
    editor.registerExternalContentHandler('text', (content) => defaultHandleExternalTextContent(editor, content))
    pendingPasteAtom.set(null)
  }
}

/**
 * La liste collée, s'il y en a une. Quand le presse-papiers contient aussi du HTML (copie depuis
 * Roam, une page web, un éditeur), tldraw passe le texte tiré du HTML, sans puces ni indentation :
 * on essaie le texte brut, puis les listes du HTML, puis ce texte.
 */
function pastedOutline(content: { text: string; html?: string; sources?: { type: string; data?: unknown; subtype?: string }[] }) {
  const source = (subtype: string) => content.sources?.find((s) => s.type === 'text' && s.subtype === subtype && typeof s.data === 'string')?.data as string | undefined
  const html = content.html ?? source('html')
  for (const text of [source('text'), html && htmlListToMarkdown(html), content.text]) {
    const outline = text ? pastedList(text) : null
    if (outline) return outline
  }
  return null
}

/** Les listes (<ul>, <ol>) d'un HTML en liste Markdown indentée ; vide s'il n'y en a pas. */
function htmlListToMarkdown(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  if (!body.querySelector('li')) return ''
  const lines: string[] = []
  const walk = (list: Element, depth: number) => {
    for (const li of Array.from(list.children).filter((c) => c.tagName === 'LI')) {
      // Texte propre de l'élément, sans ses sous-listes.
      const copy = li.cloneNode(true) as Element
      copy.querySelectorAll('ul, ol').forEach((sub) => sub.remove())
      const checkbox = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]') as HTMLInputElement | null
      const text = (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
      lines.push(`${'    '.repeat(depth)}- ${checkbox ? (checkbox.checked ? '[x] ' : '[ ] ') : ''}${text}`)
      li.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol').forEach((sub) => walk(sub, depth + 1))
    }
  }
  body.querySelectorAll('ul, ol').forEach((list) => {
    if (!list.parentElement?.closest('ul, ol')) walk(list, 0)
  })
  return lines.join('\n')
}

/** Colle la liste comme texte de la boîte : à la place du curseur si elle est en édition, sinon à la fin. */
function pasteAsText(editor: Editor, { outline, target }: PendingPaste) {
  // Le texte nettoyé de la syntaxe des outliners ; les boîtes n'ont que des listes à un niveau.
  const nodes = markdownToRichText(mapToMarkdownList(outlineToMap(outline), undefined, { checkboxes: 'glyphs' })).content
  const rich = editor.getEditingShapeId() === target ? editor.getRichTextEditor() : null
  if (rich) {
    rich.chain().focus().insertContent(nodes).run()
    return
  }
  const shape = editor.getShape(target)
  if (!shape) return
  const current = (shape.props as { richText?: TLRichText }).richText as { content?: RichNode[] } | undefined
  editor.markHistoryStoppingPoint('liste collée')
  const richText = { type: 'doc', content: [...(current?.content ?? []), ...nodes] } as TLRichText
  editor.updateShape({ id: target, type: shape.type, props: { richText } } as TLShapePartial)
}

export function PasteListDialog({ editor }: { editor: Editor }) {
  const t = useT()
  const pending = useValue(pendingPasteAtom)
  if (!pending) return null
  const close = () => pendingPasteAtom.set(null)
  const map = outlineToMap(pending.outline)
  const count = map.elements.length

  const asBranches = () => {
    close()
    editor.setEditingShape(null)
    const problems = addMapUnder(editor, map, pending.target)
    if (problems.length) alert(problems.join('\n'))
  }
  const asNewMap = () => {
    close()
    const b = editor.getShapePageBounds(pending.target)
    addMapAt(editor, map, b ? { x: b.maxX + 300, y: b.minY } : editor.getViewportPageBounds().center)
  }

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog share-dialog" role="dialog" aria-label={t.pasteList.title}>
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.pasteList.title}</h2>
          <button className="preset-icon" onClick={close} aria-label={t.common.close}>
            ✕
          </button>
        </header>
        <p className="text-xs text-zinc-500">{t.pasteList.intro(count)}</p>
        <div className="grid gap-2">
          <button className="btn-primary justify-self-start" autoFocus onClick={asBranches}>
            {t.pasteList.asBranches}
          </button>
          {pending.editing ? (
            <button
              className="btn justify-self-start"
              onClick={() => {
                close()
                pasteAsText(editor, pending)
              }}
            >
              {t.pasteList.asText}
            </button>
          ) : (
            <button className="btn justify-self-start" onClick={asNewMap}>
              {t.pasteList.asNewMap}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
