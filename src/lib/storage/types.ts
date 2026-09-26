// Stockage des documents, derrière une interface commune (côté navigateur) :
// - « cloud » : serveur Postgres (Neon), quand DATABASE_URL est défini ;
// - « local » : tout reste dans le navigateur (IndexedDB), sans serveur ni connexion.
// La synchronisation (src/lib/sync/documentSync.ts) ne connaît que cette interface.

export type StorageMode = 'cloud' | 'local'

export interface DocumentSummary {
  id: string
  title: string
  /** Horodatage ISO de la dernière sauvegarde. */
  updatedAt: string
}

export interface StoredDocument {
  version: number
  /** Instantané tldraw (TLStoreSnapshot) en JSON ; null pour un document encore vide. */
  snapshotJson: string | null
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; version: number }
  | { ok: false; reason: 'not_found' }

export interface SaveInput {
  snapshotJson: string
  title: string
  /** Version sur laquelle reposent les modifications (verrouillage optimiste). */
  baseVersion: number
  /** Écrase la version enregistrée même si elle a changé entre-temps. */
  force?: boolean
}

export interface DocumentStore {
  readonly mode: StorageMode
  list(): Promise<DocumentSummary[]>
  create(title: string, snapshotJson?: string): Promise<string>
  remove(id: string): Promise<void>
  /** null : document introuvable. */
  load(id: string): Promise<StoredDocument | null>
  version(id: string): Promise<number | null>
  save(id: string, input: SaveInput): Promise<SaveResult>
}

/** Réglages communs à tous les documents (ex. : préréglages de styles), clé → valeur JSON. */
export interface SettingsStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
}

/** Erreur de stockage, avec sa nature pour choisir le message et la conduite à tenir. */
export class StorageError extends Error {
  constructor(
    /** offline et server : on réessaiera plus tard ; les autres sont signalées. */
    public kind: 'offline' | 'server' | 'auth' | 'missing' | 'storage',
    message: string
  ) {
    super(message)
  }
}
