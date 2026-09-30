// Surligner des passages d'un texte Markdown rendu : les plages sont des positions dans le texte
// d'origine (celles de locateExcerpt). Un plugin remark découpe les nœuds de texte, dont l'analyse
// garde la position, et y pose des <mark> (avant que les retours à la ligne ne deviennent des <br>).

export interface Highlight {
  /** Plage [from, to[ dans le texte d'origine. */
  from: number
  to: number
  /** Éléments du schéma qui citent ce passage (identifiants tldraw). */
  nodes: string[]
  /** Passage d'un élément sélectionné. */
  active: boolean
  /** Couleur de l'élément sur le canevas. */
  color?: string
}

/** Le peu de l'arbre Markdown (mdast) dont on a besoin. */
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

/** Plugin remark : `source` est le texte rendu, `highlights` les passages à surligner. */
export function remarkHighlight(source: string, highlights: Highlight[]) {
  return () => (tree: MdNode) => {
    if (highlights.length) walk(tree, source, highlights)
  }
}

function walk(node: MdNode, source: string, highlights: Highlight[]) {
  if (!node.children) return
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return split(child, source, highlights)
    walk(child, source, highlights)
    return [child]
  })
}

/** Un nœud de texte, découpé en morceaux surlignés ou non. */
function split(node: MdNode, source: string, highlights: Highlight[]): MdNode[] {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  const value = node.value ?? ''
  if (start === undefined || end === undefined) return [node]
  const here = highlights.filter((h) => h.from < end && h.to > start)
  if (!here.length) return [node]
  const offsets = align(value, source, start, end)
  if (!offsets) return [node]
  const out: MdNode[] = []
  let text = ''
  let from = 0
  let to = 0
  let key = ''
  let covering: Highlight[] = []
  const flush = () => {
    if (!text) return
    if (!covering.length) out.push({ type: 'text', value: text })
    else {
      const nodes = [...new Set(covering.flatMap((h) => h.nodes))]
      const active = covering.some((h) => h.active)
      // Plusieurs éléments citent ce passage : la couleur du premier (d'abord un sélectionné).
      const color = (covering.find((h) => h.active) ?? covering[0]).color
      out.push({
        type: 'sourceMark',
        data: {
          hName: 'mark',
          hProperties: {
            className: active ? ['source-mark', 'source-mark-active'] : ['source-mark'],
            dataNodes: nodes.join(' '),
            // Plage du morceau dans le texte d'origine (pour retirer le passage qui le couvre).
            dataFrom: from,
            dataTo: to,
            ...(color && { dataColor: color }),
            // Passages de plusieurs couleurs (calques qui se recouvrent) : un soulignement chacune.
            dataColors: [...new Set(covering.map((h) => h.color).filter(Boolean))].slice(0, 3).join(' '),
          },
        },
        children: [{ type: 'text', value: text }],
      })
    }
    text = ''
  }
  for (let i = 0; i < value.length; i++) {
    const at = offsets[i]
    const now = here.filter((h) => h.from <= at && at < h.to)
    const nowKey = now.map((h) => `${h.from}:${h.to}`).join(',')
    if (nowKey !== key) {
      flush()
      key = nowKey
      covering = now
      from = at
    }
    text += value[i]
    to = at + 1
  }
  flush()
  return out
}

/**
 * Position dans le texte d'origine de chaque caractère d'un nœud : sa valeur est le passage, moins
 * ce que l'analyse a retiré (échappements, retraits de début de ligne). null : pas d'alignement.
 */
function align(value: string, source: string, start: number, end: number): number[] | null {
  const out: number[] = []
  let j = start
  for (let i = 0; i < value.length; i++) {
    while (j < end && source[j] !== value[i]) j++
    if (j >= end) return null
    out.push(j++)
  }
  return out
}
