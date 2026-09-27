/** Copie JSON d'une valeur : sans les champs `undefined`, que les métadonnées tldraw refusent. */
export function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
