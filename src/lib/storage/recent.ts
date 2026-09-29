// Dernières ouvertures des schémas, dans ce navigateur : l'accueil en tire « Ouverts récemment ».
// Une commodité locale (stockage du navigateur), jamais enregistrée avec le schéma.

const KEY = 'recently-opened'
/** Nombre de schémas retenus : de quoi en garder quelques-uns après des suppressions. */
const MAX = 20

/** Date de dernière ouverture (ms) de chaque schéma retenu. */
export function recentlyOpened(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function markOpened(id: string) {
  const entries = Object.entries({ ...recentlyOpened(), [id]: Date.now() })
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Stockage indisponible (navigation privée…) : pas de liste « récents ».
  }
}
