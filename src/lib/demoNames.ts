// Noms des schémas d'exemple. Module sans dépendance : importable côté serveur (demo.ts charge tldraw).

export type DemoName = 'liberty' | 'water' | 'truth'

export function isDemoName(value: unknown): value is DemoName {
  return value === 'liberty' || value === 'water' || value === 'truth'
}
