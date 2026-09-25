// Mise en page d'un arbre (carte mentale) : données pures, indépendantes de tldraw.
//
// Chaque sous-arbre occupe une bande perpendiculaire à la direction de l'arbre ;
// un nœud est centré sur la bande de ses enfants. Les branches repliées gardent leur
// place : replier ou déplier (en édition comme en présentation) ne déplace rien.
// Un nœud déplacé à la main garde son décalage (offset), que suit tout son sous-arbre.

export type TreeDirection = 'right' | 'down'

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
  // Axe principal : celui le long duquel l'arbre se déploie.
  const main = dir === 'right' ? 'x' : 'y'
  const cross = dir === 'right' ? 'y' : 'x'
  const mainSize = (n: TreeNode) => (dir === 'right' ? n.w : n.h)
  const crossSize = (n: TreeNode) => (dir === 'right' ? n.h : n.w)

  const band = new Map<string, number>()
  const visiting = new Set<string>()
  const childrenOf = (id: string) => (nodes.get(id)?.children ?? []).filter((c) => nodes.has(c) && !visiting.has(c))

  // 1. Largeur de bande de chaque sous-arbre (garde-fou contre les cycles).
  function measure(id: string): number {
    const node = nodes.get(id)!
    visiting.add(id)
    const kids = childrenOf(id)
    const kidsBand = kids.reduce((sum, c) => sum + measure(c), 0) + gaps.cross * Math.max(0, kids.length - 1)
    visiting.delete(id)
    const size = Math.max(crossSize(node), kidsBand)
    band.set(id, size)
    return size
  }

  // 2. Placement : les enfants se répartissent sur une bande centrée sur leur parent.
  const out = new Map<string, Vec>()
  function place(id: string, pos: Vec) {
    const node = nodes.get(id)!
    visiting.add(id)
    const kids = childrenOf(id)
    const kidsBand = kids.reduce((sum, c) => sum + band.get(c)!, 0) + gaps.cross * Math.max(0, kids.length - 1)
    let cursor = pos[cross] + crossSize(node) / 2 - kidsBand / 2
    for (const c of kids) {
      const child = nodes.get(c)!
      const slot = {
        [main]: pos[main] + mainSize(node) + gaps.main,
        [cross]: cursor + (band.get(c)! - crossSize(child)) / 2,
      } as unknown as Vec
      const actual = { x: slot.x + child.offset.x, y: slot.y + child.offset.y }
      out.set(c, actual)
      place(c, actual)
      cursor += band.get(c)! + gaps.cross
    }
    visiting.delete(id)
  }

  if (!nodes.has(rootId)) return out
  measure(rootId)
  place(rootId, rootPos)
  return out
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
