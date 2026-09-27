// Texte des boîtes : un Markdown restreint ↔ le texte riche de tldraw (document TipTap en JSON).
// Ce que les boîtes savent afficher : paragraphes (une ligne chacun), listes à puces ou numérotées,
// **gras**, *italique*, ~~barré~~, `code`, [lien](adresse). Le reste (titres, citations, tableaux)
// appartient à la note, dont le Markdown est complet. Données pures, sans tldraw.

export interface RichNode {
  type: string
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  attrs?: Record<string, unknown>
  content?: RichNode[]
}

export interface RichDoc {
  type: 'doc'
  content: RichNode[]
}

type Mark = NonNullable<RichNode['marks']>[number]

// ---------- Markdown → texte riche ----------

export function markdownToRichText(markdown: string): RichDoc {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const content: RichNode[] = []
  for (let i = 0; i < lines.length; ) {
    const bullet = /^\s*[-*+]\s+/
    const ordered = /^\s*(\d+)[.)]\s+/
    if (bullet.test(lines[i]) || ordered.test(lines[i])) {
      const isOrdered = !bullet.test(lines[i])
      const marker = isOrdered ? ordered : bullet
      const start = isOrdered ? Number(lines[i].match(ordered)![1]) : 1
      const items: RichNode[] = []
      while (i < lines.length && marker.test(lines[i]) && (isOrdered ? !bullet.test(lines[i]) : true)) {
        items.push({ type: 'listItem', content: [paragraph(lines[i].replace(marker, ''))] })
        i++
      }
      content.push(isOrdered ? { type: 'orderedList', attrs: { start }, content: items } : { type: 'bulletList', content: items })
      continue
    }
    content.push(paragraph(lines[i]))
    i++
  }
  return { type: 'doc', content }
}

function paragraph(text: string): RichNode {
  const inline = parseInline(text, [])
  return inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' }
}

/** Marques en ligne ; le texte littéral peut échapper un caractère par « \ ». */
const INLINE: { re: RegExp; mark: (m: RegExpExecArray) => Mark; inner: boolean }[] = [
  { re: /`([^`]+)`/, mark: () => ({ type: 'code' }), inner: false },
  { re: /\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/, mark: () => ({ type: 'bold' }), inner: true },
  { re: /~~(?=\S)([\s\S]*?\S)~~/, mark: () => ({ type: 'strike' }), inner: true },
  { re: /\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/, mark: () => ({ type: 'italic' }), inner: true },
  { re: /(?<![\p{L}\p{N}])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}])/u, mark: () => ({ type: 'italic' }), inner: true },
  { re: /\[([^\]]+)\]\(([^)\s]+)\)/, mark: (m) => ({ type: 'link', attrs: { href: m[2] } }), inner: true },
]

function parseInline(text: string, marks: Mark[]): RichNode[] {
  const out: RichNode[] = []
  let rest = text
  while (rest) {
    // Le premier motif trouvé (le plus à gauche ; à égalité, dans l'ordre de la liste).
    let best: { at: number; match: RegExpExecArray; rule: (typeof INLINE)[number] } | null = null
    const escape = /\\([\\`*_~[\]()#+\-.!])/.exec(rest)
    for (const rule of INLINE) {
      const m = rule.re.exec(rest)
      if (m && (!best || m.index < best.at)) best = { at: m.index, match: m, rule }
    }
    if (escape && (!best || escape.index < best.at)) {
      push(out, rest.slice(0, escape.index) + escape[1], marks)
      rest = rest.slice(escape.index + escape[0].length)
      continue
    }
    if (!best) {
      push(out, rest, marks)
      break
    }
    push(out, rest.slice(0, best.at), marks)
    const mark = best.rule.mark(best.match)
    const inner = best.match[1]
    if (best.rule.inner) for (const node of parseInline(inner, [...marks, mark])) push(out, node.text!, node.marks ?? [])
    else push(out, inner, [...marks, mark])
    rest = rest.slice(best.at + best.match[0].length)
  }
  return out
}

/** Ajoute du texte, fusionné avec le précédent s'il a les mêmes marques. */
function push(out: RichNode[], text: string, marks: Mark[]) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && sameMarks(last.marks ?? [], marks)) {
    last.text += text
    return
  }
  out.push({ type: 'text', text, ...(marks.length && { marks: [...marks] }) })
}

const markKey = (m: Mark) => `${m.type}${m.type === 'link' ? `:${String(m.attrs?.href ?? '')}` : ''}`
const sameMarks = (a: Mark[], b: Mark[]) => a.length === b.length && a.every((m, i) => markKey(m) === markKey(b[i]))

// ---------- Texte riche → Markdown ----------

/** Ordre d'ouverture des marques (le lien à l'extérieur, le code à l'intérieur). */
const ORDER = ['link', 'bold', 'italic', 'strike', 'highlight', 'code']
const OPEN: Record<string, (m: Mark) => string> = { link: () => '[', bold: () => '**', italic: () => '*', strike: () => '~~', highlight: () => '', code: () => '`' }
const CLOSE: Record<string, (m: Mark) => string> = {
  link: (m) => `](${String(m.attrs?.href ?? '')})`,
  bold: () => '**',
  italic: () => '*',
  strike: () => '~~',
  highlight: () => '',
  code: () => '`',
}

export function richTextToMarkdown(doc: { content?: RichNode[] } | undefined): string {
  if (!doc?.content) return ''
  const lines: string[] = []
  for (const block of doc.content) {
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      let n = Number(block.attrs?.start ?? 1)
      for (const item of block.content ?? []) {
        const text = (item.content ?? []).map(inlineMarkdown).join(' ')
        lines.push(block.type === 'bulletList' ? `- ${text}` : `${n++}. ${text}`)
      }
    } else {
      lines.push(inlineMarkdown(block))
    }
  }
  return lines.join('\n').trim()
}

function inlineMarkdown(block: RichNode): string {
  let out = ''
  let open: Mark[] = []
  const known = (m: Mark) => ORDER.includes(m.type)
  for (const node of block.content ?? []) {
    if (node.type === 'hardBreak') {
      out += '\n'
      continue
    }
    if (node.type !== 'text' || !node.text) continue
    const marks = (node.marks ?? []).filter(known).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    // Fermer ce qui ne continue pas (et tout ce qui a été ouvert après), puis ouvrir le reste.
    let keep = 0
    while (keep < open.length && keep < marks.length && markKey(open[keep]) === markKey(marks[keep])) keep++
    for (let i = open.length - 1; i >= keep; i--) out += CLOSE[open[i].type](open[i])
    for (let i = keep; i < marks.length; i++) out += OPEN[marks[i].type](marks[i])
    open = marks
    out += marks.some((m) => m.type === 'code') ? node.text : escapeMarkdown(node.text)
  }
  for (let i = open.length - 1; i >= 0; i--) out += CLOSE[open[i].type](open[i])
  return out
}

/** Échappe ce qui serait pris pour une marque (le « _ » seulement en début ou fin de mot). */
function escapeMarkdown(text: string): string {
  return text
    .replace(/([\\`*~[\]])/g, '\\$1')
    .replace(/(^|[^\p{L}\p{N}])_/gu, '$1\\_')
    .replace(/_(?=[^\p{L}\p{N}]|$)/gu, '\\_')
    .replace(/^(\s*)([-+]|\d+[.)])(\s)/, '$1\\$2$3')
}

/** Texte sans ses marques (pour comparer une citation à la source). */
export function stripInlineMarkdown(text: string): string {
  return richTextToPlain(markdownToRichText(text))
}

function richTextToPlain(doc: RichDoc): string {
  const texts = (n: RichNode): string => (n.text ?? '') + (n.content ?? []).map(texts).join(n.type === 'doc' ? '\n' : '')
  return texts(doc)
}
