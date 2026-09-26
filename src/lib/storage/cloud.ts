// Stockage « cloud » : les routes /api/documents, adossées à Postgres.

import { m } from '@/i18n/client'
import { StorageError, type DocumentStore, type DocumentSummary, type SettingsStore, type StoredDocument } from './types'

async function request(url: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store', ...init })
  } catch {
    throw new StorageError('offline', m().errors.offline)
  }
  if (res.status === 401) throw new StorageError('auth', m().errors.sessionExpired)
  if (res.status >= 500) throw new StorageError('server', m().errors.server(res.status))
  return res
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new StorageError('server', m().errors.server(res.status))
  return (await res.json()) as T
}

export const cloudStore: DocumentStore = {
  mode: 'cloud',

  async list() {
    const { documents } = await json<{ documents: DocumentSummary[] }>(await request('/api/documents'))
    return documents
  },

  async create(title, snapshotJson) {
    const body = `{"title":${JSON.stringify(title)}${snapshotJson ? `,"snapshot":${snapshotJson}` : ''}}`
    const res = await request('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (res.status === 413) throw new StorageError('server', m().errors.fileTooLarge)
    return (await json<{ id: string }>(res)).id
  },

  async remove(id) {
    const res = await request(`/api/documents/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new StorageError('server', m().errors.server(res.status))
  },

  async load(id) {
    const res = await request(`/api/documents/${id}`)
    if (res.status === 404) return null
    const doc = await json<{ version: number; snapshot: unknown }>(res)
    return { version: doc.version, snapshotJson: doc.snapshot ? JSON.stringify(doc.snapshot) : null } satisfies StoredDocument
  },

  async version(id) {
    const res = await request(`/api/documents/${id}?meta=1`)
    if (res.status === 404) return null
    return (await json<{ version: number }>(res)).version
  },

  async save(id, input) {
    // L'instantané est déjà sérialisé : on l'insère tel quel dans le corps de la requête.
    const rest = JSON.stringify({ title: input.title, baseVersion: input.baseVersion, force: !!input.force })
    const res = await request(`/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: `{"snapshot":${input.snapshotJson},${rest.slice(1)}`,
    })
    if (res.status === 409) return { ok: false, reason: 'conflict', version: (await res.json()).version }
    if (res.status === 404) return { ok: false, reason: 'not_found' }
    return { ok: true, version: (await json<{ version: number }>(res)).version }
  },
}

export const cloudSettings: SettingsStore = {
  async get<T>(key: string) {
    return (await json<{ value: T | null }>(await request(`/api/settings/${key}`))).value
  },
  async set(key, value) {
    const res = await request(`/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    if (!res.ok) throw new StorageError('server', m().errors.server(res.status))
  },
}
