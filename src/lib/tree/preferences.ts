// Orientation d'un nouvel arbre : la dernière choisie, pour une carte d'argument comme pour une
// carte mentale (chacune la sienne). Réglage de ce navigateur ; « vers la droite » par défaut.

import { TREE_DIRECTIONS, type TreeDirection } from './layout'

const key = (argument: boolean) => (argument ? 'treeDirection.argument' : 'treeDirection.mindmap')

export function preferredDirection(argument: boolean): TreeDirection {
  try {
    const stored = localStorage.getItem(key(argument)) as TreeDirection | null
    return stored && TREE_DIRECTIONS.includes(stored) ? stored : 'right'
  } catch {
    return 'right'
  }
}

export function rememberDirection(argument: boolean, dir: TreeDirection) {
  try {
    localStorage.setItem(key(argument), dir)
  } catch {
    // stockage indisponible (navigation privée…) : l'orientation ne sera pas retenue
  }
}
