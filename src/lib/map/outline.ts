// Import d'un plan : liste à puces ou numérotée, Markdown à titres, texte indenté, copie d'un
// outliner (Roam Research, Logseq, Obsidian, Workflowy…) ou fichier OPML. Chaque ligne devient une
// boîte, l'indentation (ou le niveau de titre) donne l'arbre. La syntaxe propre aux outliners est
// convertie en texte lisible : [[page]] → page, {{…}} et ((référence)) retirés, TODO / DONE et
// [ ] / [x] lus comme des cases à cocher (champ `task`). Données pures, sans tldraw.

import { MAP_FORMAT, MAP_VERSION, type MapElement, type TaskState, type UnveilMap } from './format'

export interface OutlineNode {
  text: string
  /** Paragraphes qui suivent un titre ou un élément (Markdown). */
  note?: string
  task?: TaskState
  folded?: boolean
  children: OutlineNode[]
}

export interface Outline {
  /** Titre trouvé dans le texte : titre de premier niveau unique, <title> d'un OPML, title:: de Logseq. */
  title?: string
  /** Texte placé avant le premier élément. */
  intro?: string
  roots: OutlineNode[]
}

/** Le texte est du JSON (ou une réponse d'IA qui en contient) plutôt qu'un plan. */
export function looksLikeJson(text: string): boolean {
  return /^\s*(\{|\[|```json)/.test(text)
}

export function parseOutline(text: string): Outline {
  return /^\s*(<\?xml[^>]*>\s*)?<opml[\s>]/i.test(text) ? parseOpml(text) : parseMarkdownOutline(text)
}

// ---------- Markdown, listes, texte indenté ----------

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const LIST_ITEM = /^(\s*)(?:[-*+•]|\d+[.)])\s+(.*)$/
/** Ligne d'attribut (Roam, Logseq) : « clé:: valeur ». */
const PROPERTY = /^\s*([\p{L}\p{N}_-]+)::\s*(.*)$/u
/** Propriétés techniques de Logseq, sans intérêt dans une boîte. */
const HIDDEN_PROPERTIES = new Set(['id', 'collapsed', 'heading', 'background-color', 'icon', 'template', 'template-including-parent'])

function parseMarkdownOutline(input: string): Outline {
  const lines = input
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n/, '') // en-tête YAML
    .split('\n')
    .map((l) => l.replace(/\t/g, '    ').replace(/\s+$/, ''))
  // Sans titre ni puce : chaque ligne non vide est un élément, l'indentation donne l'arbre.
  const plain = !lines.some((l) => HEADING.test(l) || LIST_ITEM.test(l))
  const outline: Outline = { roots: [] }
  const headings: { level: number; node: OutlineNode }[] = []
  let items: { indent: number; node: OutlineNode }[] = []
  /** Dernier élément créé : reçoit les lignes de continuation et les paragraphes. */
  let last: { node: OutlineNode; indent: number; kind: 'heading' | 'item' } | null = null
  let paragraph: string[] = []
  let fence: string[] | null = null
  let h1s = 0

  const flush = () => {
    const text = paragraph.join('\n').trim()
    paragraph = []
    if (!text) return
    const target = last?.node
    if (!target) outline.intro = outline.intro ? `${outline.intro}\n\n${text}` : text
    else target.note = target.note ? `${target.note}\n\n${text}` : text
  }
  const attach = (node: OutlineNode, parent: OutlineNode | undefined) => (parent ? parent.children : outline.roots).push(node)

  for (const line of lines) {
    if (fence) {
      fence.push(line)
      if (/^\s*```/.test(line)) {
        paragraph.push(fence.join('\n'))
        fence = null
      }
      continue
    }
    if (/^\s*```/.test(line)) {
      fence = [line.trim()]
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const property = line.match(PROPERTY)
    if (property) {
      const [, key, value] = property
      const name = key.toLowerCase()
      if (name === 'collapsed' && last) last.node.folded = value.trim() === 'true'
      else if (name === 'title' && !last) outline.title = cleanInline(value).text
      if (HIDDEN_PROPERTIES.has(name) || (name === 'title' && !last)) continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      flush()
      const level = heading[1].length
      if (level === 1) h1s++
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop()
      const node = makeNode(heading[2])
      attach(node, headings[headings.length - 1]?.node)
      headings.push({ level, node })
      items = []
      last = { node, indent: -1, kind: 'heading' }
      continue
    }
    const item = plain ? line.match(/^(\s*)(.*)$/) : line.match(LIST_ITEM)
    if (item) {
      const indent = item[1].length
      flush()
      while (items.length && items[items.length - 1].indent >= indent) items.pop()
      const node = makeNode(item[2])
      attach(node, items[items.length - 1]?.node ?? headings[headings.length - 1]?.node)
      items.push({ indent, node })
      last = { node, indent, kind: 'item' }
      continue
    }
    // Ligne sans puce sous un élément de liste, plus indentée que lui : la suite de son texte.
    const indent = line.length - line.trimStart().length
    if (last?.kind === 'item' && indent > last.indent && paragraph.length === 0) {
      appendLine(last.node, line.trim())
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) continue // ligne de séparation
    paragraph.push(line.trim())
  }
  if (fence) paragraph.push(fence.join('\n'))
  flush()

  // Un seul titre de premier niveau, en tête : c'est le titre du plan.
  if (h1s === 1 && outline.roots.length === 1 && lines.find((l) => l.trim())?.match(/^#\s/)) outline.title ??= outline.roots[0].text
  prune(outline.roots)
  return outline
}

function appendLine(node: OutlineNode, raw: string) {
  const { text } = cleanInline(raw)
  if (text) node.text = node.text ? `${node.text}\n${text}` : text
}

function makeNode(raw: string): OutlineNode {
  const { text, task } = cleanInline(raw)
  return { text, ...(task && { task }), children: [] }
}

/** Retire les éléments vides (une ligne qui ne contenait qu'un composant Roam) sans enfants. */
function prune(nodes: OutlineNode[]) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    prune(nodes[i].children)
    if (!nodes[i].text && !nodes[i].note && !nodes[i].children.length) nodes.splice(i, 1)
  }
}

// ---------- Syntaxe des outliners ----------

const TASK_WORDS: Record<string, TaskState> = { TODO: 'todo', DOING: 'todo', NOW: 'todo', LATER: 'todo', WAITING: 'todo', DONE: 'done' }

/** Texte d'un élément, débarrassé de la syntaxe propre aux outliners ; sa case à cocher, s'il en a une. */
export function cleanInline(raw: string): { text: string; task?: TaskState } {
  let text = raw.trim()
  let task: TaskState | undefined

  // Cases à cocher : {{[[TODO]]}} (Roam), [ ] / [x] (Markdown, Obsidian), TODO / DONE (Logseq, Org).
  text = text.replace(/\{\{\s*\[\[(TODO|DONE)\]\]\s*\}\}|\{\{\s*(TODO|DONE)\s*\}\}/g, (_, a: string, b: string) => {
    task ??= (a ?? b) === 'DONE' ? 'done' : 'todo'
    return ''
  })
  const box = text.match(/^\[([ xX])\]\s+/)
  if (box) {
    task ??= box[1] === ' ' ? 'todo' : 'done'
    text = text.slice(box[0].length)
  }
  const word = text.match(/^(TODO|DOING|NOW|LATER|WAITING|DONE)\s+/)
  if (word) {
    task ??= TASK_WORDS[word[1]]
    text = text.slice(word[0].length)
  }

  text = text
    // Roam : alias vers une page ou un bloc, [libellé]([[page]]) ou [libellé](((uid)))
    .replace(/\[([^\]]+)\]\((?:\[\[[^\]]*\]\]|\(\([\w-]+\)\))\)/g, '$1')
    // Composants {{…}} (intégrations, tableaux, minuteurs…) : on garde une adresse s'il y en a une
    .replace(/\{\{[^{}]*\}\}/g, (m) => m.match(/https?:\/\/[^\s}]+/)?.[0] ?? '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    // Références de bloc ((uid)) et intégrations d'Obsidian ![[…]]
    .replace(/\(\(\s*[\w-]{6,}\s*\)\)/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    // Images Markdown : leur texte de remplacement
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Pages : #[[page]], [[page]], [[page|alias]] (Obsidian), [[page#titre]]
    .replace(/#?\[\[([^\]|#]*)(?:#[^\]|]*)?\|([^\]]*)\]\]/g, '$2')
    .replace(/#?\[\[([^\]|]*?)(?:#[^\]]*)?\]\]/g, '$1')
    // Mises en forme de Roam et d'Obsidian : __italique__, ^^surligné^^, ==surligné==
    .replace(/__(?=\S)(.+?)__/g, '*$1*')
    .replace(/\^\^(.+?)\^\^/g, '$1')
    .replace(/==(?=\S)(.+?)==/g, '$1')
    // Attribut en ligne : « clé:: valeur »
    .replace(/^([\p{L}\p{N}_ -]+)::\s*/u, '$1 : ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return { text, ...(task && { task }) }
}

// ---------- OPML (Workflowy, Dynalist, Logseq, outils de cartes mentales…) ----------

function parseOpml(xml: string): Outline {
  const outline: Outline = { roots: [] }
  const title = xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
  if (title?.trim()) outline.title = decodeEntities(title.trim())
  const body = xml.slice(Math.max(0, xml.search(/<body[\s>]/i)))
  const stack: OutlineNode[] = []
  const tag = /<outline\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<\/outline\s*>/gi
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    if (m[0].startsWith('</')) {
      stack.pop()
      continue
    }
    const attrs = readAttributes(m[1])
    const html = attrs.text ?? attrs.title ?? ''
    const { text, task } = cleanInline(htmlToMarkdown(html))
    const node: OutlineNode = { text, children: [] }
    if (attrs.checkbox === 'true' || task) node.task = attrs.checked === 'true' || attrs.complete === 'true' ? 'done' : (task ?? 'todo')
    if (attrs._note?.trim()) node.note = htmlToMarkdown(attrs._note).trim()
    if (attrs.collapsed === 'true') node.folded = true
    ;(stack.length ? stack[stack.length - 1].children : outline.roots).push(node)
    if (!m[2]) stack.push(node)
  }
  prune(outline.roots)
  return outline
}

function readAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const [, name, , dq, sq] of source.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[name] = decodeEntities(dq ?? sq ?? '')
  return attrs
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (named[e.toLowerCase()] ?? m)
  )
}

/** Le peu de HTML que les outliners mettent dans leurs textes, en Markdown. */
function htmlToMarkdown(html: string): string {
  return decodeEntities(
    html
      .replace(/<\/?(b|strong)>/gi, '**')
      .replace(/<\/?(i|em)>/gi, '*')
      .replace(/<\/?(s|strike|del)>/gi, '~~')
      .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
}

// ---------- Plan → schéma ----------

export interface OutlineToMapOptions {
  /** Plusieurs têtes de liste : les réunir sous une racine commune, dont c'est le texte. */
  joinUnder?: string
  title?: string
}

/** Un plan en schéma « unveilboard/map » : des cartes mentales, une par tête de liste ou une seule. */
export function outlineToMap(outline: Outline, opts: OutlineToMapOptions = {}): UnveilMap {
  const title = (opts.title ?? outline.title)?.slice(0, 200)
  let roots = outline.roots
  let intro = outline.intro
  if (roots.length > 1 && opts.joinUnder !== undefined) {
    roots = [{ text: opts.joinUnder, ...(intro && { note: intro }), children: roots }]
    intro = undefined
  }
  const elements: MapElement[] = []
  let next = 0
  const visit = (node: OutlineNode, parent?: string) => {
    const id = `n${++next}`
    elements.push({
      id,
      text: (node.text || '…').slice(0, 4000),
      ...(parent ? { parent } : { tree: { kind: 'mindmap' } }),
      ...(node.task && { task: node.task }),
      ...(node.note && { note: node.note.slice(0, 20000) }),
      ...(node.folded && node.children.length > 0 && { folded: true }),
    })
    for (const child of node.children) visit(child, id)
  }
  roots.forEach((root, i) => visit(i === 0 && intro ? { ...root, note: [intro, root.note].filter(Boolean).join('\n\n') } : root))
  return { format: MAP_FORMAT, version: MAP_VERSION, ...(title && { title }), elements }
}

/** Nombre de niveaux du plan (pour l'aperçu). */
export function outlineDepth(nodes: OutlineNode[]): number {
  return nodes.reduce((max, n) => Math.max(max, 1 + outlineDepth(n.children)), 0)
}

// ---------- Schéma → liste ----------

/**
 * Le schéma en liste Markdown indentée (à coller dans Roam, Logseq, Obsidian, un document…) :
 * une ligne par élément, les cases à cocher en [ ] / [x]. `roots` : n'écrire que ces éléments et
 * leurs branches (par défaut, tout le schéma). Les notes, les liens et la séquence sont laissés de côté.
 */
export function mapToMarkdownList(
  map: UnveilMap,
  roots?: string[],
  /** Cases à cocher : en Markdown ([ ] / [x]), ou en signes (☐ / ☑) pour le texte d'une boîte. */
  opts: { checkboxes?: 'markdown' | 'glyphs' } = {}
): string {
  const byId = new Map(map.elements.map((e) => [e.id, e]))
  const children = new Map<string, MapElement[]>()
  for (const e of map.elements) if (e.parent && byId.has(e.parent)) children.set(e.parent, [...(children.get(e.parent) ?? []), e])
  // Un élément choisi dont un ancêtre l'est aussi est déjà écrit dans sa branche.
  const chosen = roots ? new Set(roots.filter((id) => byId.has(id))) : null
  const hasChosenAncestor = (e: MapElement) => {
    for (let p = e.parent && byId.get(e.parent); p; p = p.parent ? byId.get(p.parent) : undefined) if (chosen!.has(p.id)) return true
    return false
  }
  const tops = chosen
    ? map.elements.filter((e) => chosen.has(e.id) && !hasChosenAncestor(e))
    : map.elements.filter((e) => !e.parent || !byId.has(e.parent))
  const lines: string[] = []
  const write = (e: MapElement, depth: number) => {
    const glyphs = opts.checkboxes === 'glyphs'
    const box = e.task === 'done' ? (glyphs ? '☑ ' : '[x] ') : e.task === 'todo' ? (glyphs ? '☐ ' : '[ ] ') : ''
    // Une boîte de plusieurs lignes (ou une liste) tient sur une ligne.
    const text = e.text
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
      .filter(Boolean)
      .join(' ; ')
    lines.push(`${'    '.repeat(depth)}- ${box}${text || '…'}`)
    for (const c of children.get(e.id) ?? []) write(c, depth + 1)
  }
  for (const e of tops) write(e, 0)
  return lines.join('\n')
}

/**
 * Texte collé qui est une liste (au moins deux éléments, avec des puces ou des titres) : son plan.
 * Un simple paragraphe, ou des lignes sans puces, restent du texte.
 */
export function pastedList(text: string): Outline | null {
  if (looksLikeJson(text)) return null
  const lines = text.split(/\r\n?|\n/).filter((l) => l.trim())
  if (lines.length < 2 || !lines.some((l) => LIST_ITEM.test(l.replace(/\t/g, '    ')) || HEADING.test(l))) return null
  const outline = parseMarkdownOutline(text)
  const count = (nodes: OutlineNode[]): number => nodes.reduce((n, node) => n + 1 + count(node.children), 0)
  return count(outline.roots) >= 2 ? outline : null
}
