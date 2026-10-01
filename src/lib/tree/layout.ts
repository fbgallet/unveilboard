// Mise en page d'un arbre (carte mentale) : données pures, indépendantes de tldraw.
//
// Chaque sous-arbre occupe une bande perpendiculaire à la direction de l'arbre ;
// un nœud est centré sur la bande de ses enfants. Une branche repliée ne garde que la
// place de son nœud : les voisins se resserrent, et s'écartent à nouveau au dépliage
// (ses descendants, cachés, restent placés par rapport à lui).
// Un nœud déplacé à la main garde son décalage (offset), que suit tout son sous-arbre.
// « both » : carte mentale équilibrée, les enfants de la racine à droite ou à gauche (side).

export type TreeDirection = 'right' | 'left' | 'down' | 'up' | 'both'

export const TREE_DIRECTIONS: TreeDirection[] = ['right', 'left', 'down', 'up', 'both']

/** Axe le long duquel l'arbre se déploie (horizontal : x) et sens (+1 ou −1) ; « both » : horizontal. */
export function treeAxis(dir: TreeDirection) {
  return { horizontal: dir !== 'down' && dir !== 'up', sign: dir === 'left' || dir === 'up' ? -1 : 1 }
}

export type TreeSide = 'left' | 'right'

export interface Vec {
  x: number
  y: number
}

export interface TreeNode {
  w: number
  h: number
  /** Décalage manuel par rapport à la place calculée. */
  offset: Vec
  /** Enfants, dans l'ordre d'affichage. */
  children: string[]
  /** Disposition « both », enfants de la racine : côté de la branche. */
  side?: TreeSide
  /** Écarts propres entre ce nœud et ses enfants (ex. : prémisses liées, resserrées sous leur pastille). */
  gaps?: { main: number; cross: number }
  /** Branche repliée : elle n'occupe que la place du nœud. */
  collapsed?: boolean
}

export const TREE_GAPS = { main: 72, cross: 24 }

/** Position (coin supérieur gauche) de chaque descendant ; la racine reste où elle est. */
export function layoutTree(
  rootId: string,
  rootPos: Vec,
  nodes: Map<string, TreeNode>,
  dir: TreeDirection,
  gaps = TREE_GAPS
): Map<string, Vec> {
  // Axe principal : celui le long duquel l'arbre se déploie ; vers la gauche ou le haut, sign = −1.
  const { horizontal, sign: mainSign } = treeAxis(dir)
  const main = horizontal ? 'x' : 'y'
  const cross = horizontal ? 'y' : 'x'
  const mainSize = (n: TreeNode) => (horizontal ? n.w : n.h)
  const crossSize = (n: TreeNode) => (horizontal ? n.h : n.w)

  const band = new Map<string, number>()
  const visiting = new Set<string>()
  const childrenOf = (id: string) => (nodes.get(id)?.children ?? []).filter((c) => nodes.has(c) && !visiting.has(c))

  // 1. Largeur de bande de chaque sous-arbre (garde-fou contre les cycles).
  function measure(id: string): number {
    const node = nodes.get(id)!
    visiting.add(id)
    const kids = childrenOf(id)
    const g = node.gaps ?? gaps
    const kidsBand = kids.reduce((sum, c) => sum + measure(c), 0) + g.cross * Math.max(0, kids.length - 1)
    visiting.delete(id)
    const size = node.collapsed ? crossSize(node) : Math.max(crossSize(node), kidsBand)
    band.set(id, size)
    return size
  }

  // 2. Placement : les enfants se répartissent sur une bande centrée sur leur parent.
  const out = new Map<string, Vec>()
  function place(id: string, pos: Vec, sign: number, only?: TreeSide) {
    const node = nodes.get(id)!
    visiting.add(id)
    const kids = childrenOf(id).filter((c) => !only || (nodes.get(c)!.side ?? 'right') === only)
    const g = node.gaps ?? gaps
    const kidsBand = kids.reduce((sum, c) => sum + band.get(c)!, 0) + g.cross * Math.max(0, kids.length - 1)
    let cursor = pos[cross] + crossSize(node) / 2 - kidsBand / 2
    for (const c of kids) {
      const child = nodes.get(c)!
      const slot = {
        [main]: sign > 0 ? pos[main] + mainSize(node) + g.main : pos[main] - g.main - mainSize(child),
        [cross]: cursor + (band.get(c)! - crossSize(child)) / 2,
      } as unknown as Vec
      const actual = { x: slot.x + child.offset.x, y: slot.y + child.offset.y }
      out.set(c, actual)
      place(c, actual, sign)
      cursor += band.get(c)! + g.cross
    }
    visiting.delete(id)
  }

  if (!nodes.has(rootId)) return out
  if (dir === 'both') {
    // Chaque côté se répartit sur sa propre bande, centrée sur la racine.
    for (const side of ['right', 'left'] as const) {
      visiting.add(rootId)
      childrenOf(rootId).forEach(measure)
      visiting.delete(rootId)
      place(rootId, rootPos, side === 'right' ? 1 : -1, side)
    }
    return out
  }
  measure(rootId)
  place(rootId, rootPos, mainSign)
  return out
}

/**
 * Courbure d'une branche courbe (propriété `bend` d'une flèche tldraw en arc), du point de départ
 * sur le parent au point d'arrivée sur l'enfant : un arc de cercle qui arrive sur l'enfant dans le
 * sens de l'arbre (à plat, pour un arbre horizontal) ; les branches d'un même parent s'ouvrent
 * ainsi en éventail. Plafonnée au quart de cercle, quand l'enfant est très décalé.
 */
export function branchBend(from: Vec, to: Vec, horizontal: boolean): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const cross = Math.abs(horizontal ? dy : dx)
  if (cross < 1) return 0
  const chord2 = dx * dx + dy * dy
  const radius = chord2 / (2 * cross)
  const chord = Math.sqrt(chord2)
  const sagitta = Math.min(radius - Math.sqrt(Math.max(0, radius * radius - chord2 / 4)), chord * (1 - Math.SQRT1_2) / Math.SQRT2)
  // tldraw décale le milieu de l'arc de −bend le long de la perpendiculaire (y, −x) à la corde.
  return (horizontal ? 1 : -1) * Math.sign(dx) * Math.sign(dy) * sagitta
}

/** Descendants d'un nœud (sans lui-même), en profondeur d'abord. */
export function descendantsOf(children: Map<string, string[]>, id: string): string[] {
  const out: string[] = []
  const seen = new Set([id])
  const stack = [...(children.get(id) ?? [])]
  while (stack.length) {
    const c = stack.pop()!
    if (seen.has(c)) continue
    seen.add(c)
    out.push(c)
    stack.push(...(children.get(c) ?? []))
  }
  return out
}

/** Vrai si un ancêtre du nœud vérifie le prédicat (ex. : est replié). */
export function hasAncestor(parent: Map<string, string>, id: string, test: (ancestor: string) => boolean): boolean {
  const seen = new Set([id])
  for (let p = parent.get(id); p && !seen.has(p); p = parent.get(p)) {
    if (test(p)) return true
    seen.add(p)
  }
  return false
}

/**
 * Côté d'un nouvel enfant de la racine en disposition « both » : celui dont la bande est la
 * plus étroite (à égalité, la droite).
 */
export function lighterSide(heights: { side: TreeSide; size: number }[]): TreeSide {
  const total = (side: TreeSide) => heights.filter((h) => h.side === side).reduce((sum, h) => sum + h.size, 0)
  return total('left') < total('right') ? 'left' : 'right'
}
