import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '.'
import { settings } from './schema'

const OWNER = 'owner'

export async function getSetting(key: string) {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.ownerId, OWNER), eq(settings.key, key)))
  return row?.value ?? null
}

export async function putSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ ownerId: OWNER, key, value })
    .onConflictDoUpdate({ target: [settings.ownerId, settings.key], set: { value, updatedAt: sql`now()` } })
}
