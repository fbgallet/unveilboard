'use client'

import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n/client'
import { uploadImage } from '@/lib/sync/assetStore'
import { Markdownish } from './Markdownish'

// Saisie Markdown de la narration et des notes : barre d'outils, raccourcis (Ctrl/⌘ + B, I, K),
// images collées ou déposées, aperçu, et grand éditeur pour les textes longs.
// Les modifications passent par la commande d'insertion du navigateur : Ctrl+Z les annule.

interface Props {
  value: string
  onChange(value: string): void
  placeholder?: string
  /** Hauteur de départ de la zone de saisie (lignes). */
  rows?: number
  /** Titre du grand éditeur. */
  title?: string
  /** Enregistre une image insérée et renvoie son adresse (par défaut : téléversée ou intégrée). */
  storeImage?: (file: File) => Promise<string>
  /** Adresse affichable d'une image (aperçu). */
  resolveSrc?: (src: string) => string | undefined
  /** Occuper toute la hauteur disponible (texte long, ex. : le texte source). */
  fill?: boolean
  /** Nom accessible de la zone de saisie. */
  label?: string
}

export function MarkdownEditor(props: Props) {
  const t = useT()
  const [preview, setPreview] = useState(false)
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`md-editor ${props.fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      <MarkdownField
        {...props}
        preview={preview}
        onTogglePreview={() => setPreview(!preview)}
        onExpand={() => setExpanded(true)}
        large={props.fill}
      />
      {expanded &&
        createPortal(
          <div className="md-overlay" onPointerDown={(e) => e.target === e.currentTarget && setExpanded(false)}>
            <div className="md-dialog" role="dialog" aria-label={props.title ?? t.editor.expand}>
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-700">{props.title}</h2>
                <button className="btn-xs" onClick={() => setExpanded(false)}>
                  {t.editor.close}
                </button>
              </header>
              {/* Saisie et rendu côte à côte */}
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
                <MarkdownField {...props} rows={24} large />
                <div className="md-preview overflow-y-auto">
                  <Markdownish text={props.value} resolveSrc={props.resolveSrc} />
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function MarkdownField({
  value,
  onChange,
  placeholder,
  rows = 4,
  storeImage = uploadImage,
  resolveSrc,
  preview,
  onTogglePreview,
  onExpand,
  large,
  label,
}: Props & { preview?: boolean; onTogglePreview?(): void; onExpand?(): void; large?: boolean }) {
  const t = useT()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Remplace la sélection par `text`, puis sélectionne [selStart, selEnd] relatifs au début du remplacement. */
  function replace(text: string, from: number, to: number, selStart = text.length, selEnd = selStart) {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(from, to)
    // insertText garde l'historique d'annulation ; repli si le navigateur ne le permet pas.
    if (!document.execCommand('insertText', false, text)) {
      el.setRangeText(text, from, to, 'end')
      onChange(el.value)
    }
    el.setSelectionRange(from + selStart, from + selEnd)
  }

  /** Entoure la sélection de `mark` (ou retire la marque si elle y est déjà). */
  function wrap(mark: string, fallback: string) {
    const el = ref.current
    if (!el) return
    // Le texte de la zone elle-même : la valeur React peut retarder d'une frappe.
    const { selectionStart: s, selectionEnd: e, value: text } = el
    const selected = text.slice(s, e)
    const before = text.slice(s - mark.length, s)
    const after = text.slice(e, e + mark.length)
    if (before === mark && after === mark) return replace(selected, s - mark.length, e + mark.length, 0, selected.length)
    const inner = selected || fallback
    replace(mark + inner + mark, s, e, mark.length, mark.length + inner.length)
  }

  /** Ajoute (ou retire) un préfixe au début de chaque ligne sélectionnée. */
  function prefixLines(prefix: string) {
    const el = ref.current
    if (!el) return
    const value = el.value
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1
    const endNl = value.indexOf('\n', el.selectionEnd)
    const end = endNl === -1 ? value.length : endNl
    const lines = value.slice(start, end).split('\n')
    const all = lines.every((l) => l.startsWith(prefix))
    const text = lines.map((l) => (all ? l.slice(prefix.length) : prefix + l.replace(/^(#{1,6} |[-*] |> |\d+\. )/, ''))).join('\n')
    replace(text, start, end, 0, text.length)
  }

  function link() {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const label = el.value.slice(s, e) || t.editor.linkText
    const text = `[${label}](https://)`
    replace(text, s, e, label.length + 3, text.length - 1)
  }

  async function insertImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return false
    setBusy(true)
    setError(null)
    try {
      for (const file of images) {
        const src = await storeImage(file)
        const at = ref.current ? ref.current.selectionEnd : value.length
        const alt = file.name.replace(/\.[^.]+$/, '')
        replace(`\n![${alt}](${src})\n`, at, at)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
    return true
  }

  function pickImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => input.files && void insertImages([...input.files])
    input.click()
  }

  /**
   * Raccourcis Markdown usuels : Ctrl/⌘ + B, I, K, E (code) ; + Maj : X (barré), 7 (liste
   * numérotée), 8 (liste), 9 (citation) ; + Alt : 1 à 3 (titres). Les chiffres par leur touche
   * physique (e.code), quelle que soit la disposition du clavier.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return
    const key = e.key.toLowerCase()
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1]
    if (e.altKey && !e.shiftKey && digit && '123'.includes(digit)) prefixLines(`${'#'.repeat(Number(digit))} `)
    else if (e.altKey) return
    else if (e.shiftKey && key === 'x') wrap('~~', t.editor.strikeText)
    else if (e.shiftKey && digit === '7') prefixLines('1. ')
    else if (e.shiftKey && digit === '8') prefixLines('- ')
    else if (e.shiftKey && digit === '9') prefixLines('> ')
    else if (e.shiftKey) return
    else if (key === 'b') wrap('**', t.editor.boldText)
    else if (key === 'i') wrap('*', t.editor.italicText)
    else if (key === 'e') wrap('`', t.editor.codeText)
    else if (key === 'k') link()
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className={`flex min-h-0 flex-col ${large ? 'h-full' : ''}`}>
      <div className="md-toolbar">
        <Tool label={<b>B</b>} title={t.editor.bold} onAction={() => wrap('**', t.editor.boldText)} />
        <Tool label={<i className="font-serif">I</i>} title={t.editor.italic} onAction={() => wrap('*', t.editor.italicText)} />
        <Tool label={<s>S</s>} title={t.editor.strike} onAction={() => wrap('~~', t.editor.strikeText)} />
        <Tool label={<code className="text-[10px]">{'</>'}</code>} title={t.editor.code} onAction={() => wrap('`', t.editor.codeText)} />
        <Tool label="H" title={t.editor.heading} onAction={() => prefixLines('## ')} />
        <Tool label="•" title={t.editor.list} onAction={() => prefixLines('- ')} />
        <Tool label="1." title={t.editor.numbered} onAction={() => prefixLines('1. ')} />
        <Tool label="❝" title={t.editor.quote} onAction={() => prefixLines('> ')} />
        <Tool label="🔗" title={t.editor.link} onAction={link} />
        <Tool label="▣" title={t.editor.image} onAction={pickImage} />
        <span className="flex-1" />
        {busy && <span className="text-[10px] text-zinc-400">{t.editor.uploading}</span>}
        {onTogglePreview && (
          <button type="button" className={`md-tool md-tool-text ${preview ? 'md-tool-on' : ''}`} onClick={onTogglePreview}>
            {preview ? t.editor.edit : t.editor.preview}
          </button>
        )}
        {onExpand && <Tool label="⤢" title={t.editor.expand} onAction={onExpand} />}
      </div>
      {preview ? (
        <div className="md-preview max-h-80 overflow-y-auto">
          <Markdownish text={value || '—'} resolveSrc={resolveSrc} />
        </div>
      ) : (
        <textarea
          ref={ref}
          className={`md-textarea ${large ? 'flex-1' : ''}`}
          rows={rows}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.some((f) => f.type.startsWith('image/'))) {
              e.preventDefault()
              void insertImages(files)
            }
          }}
          onDragOver={(e) => [...e.dataTransfer.items].some((i) => i.type.startsWith('image/')) && e.preventDefault()}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files]
            if (files.some((f) => f.type.startsWith('image/'))) {
              e.preventDefault()
              void insertImages(files)
            }
          }}
        />
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}

function Tool({ label, title, onAction }: { label: ReactNode; title: string; onAction(): void }) {
  return (
    <button
      type="button"
      className="md-tool"
      title={title}
      aria-label={title}
      // Garder le focus (et la sélection) dans la zone de saisie.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAction}
    >
      {label}
    </button>
  )
}
