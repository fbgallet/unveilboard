// Extrait d'un schéma autour d'un élément : ses ancêtres jusqu'à la racine, lui, et sa branche
// (avec les liens entre ces éléments). Pour une demande à l'IA qui ne doit pas voir tout le schéma.

import type { UnveilMap } from './format'

export function extractAround(map: UnveilMap, focus: string): UnveilMap {
  const byId = new Map(map.elements.map((e) => [e.id, e]))
  const keep = new Set<string>()
  // Ancêtres (garde-fou contre un cycle).
  for (let id: string | undefined = focus; id && byId.has(id) && !keep.has(id); id = byId.get(id)?.parent) keep.add(id)
  // Branche : les descendants, dans l'ordre du schéma (les parents viennent avant leurs enfants).
  const branch = new Set([focus])
  for (const e of map.elements) {
    if (e.parent && branch.has(e.parent)) {
      branch.add(e.id)
      keep.add(e.id)
    }
  }
  const links = (map.links ?? []).filter((l) => keep.has(l.from) && keep.has(l.to))
  return {
    format: map.format,
    version: map.version,
    ...(map.title && { title: map.title }),
    ...(map.lang && { lang: map.lang }),
    ...(map.vocabulary && { vocabulary: map.vocabulary }),
    elements: map.elements.filter((e) => keep.has(e.id)),
    ...(links.length && { links }),
  }
}
