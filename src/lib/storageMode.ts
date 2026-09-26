import type { StorageMode } from './storage/types'

/**
 * Mode de stockage de cette instance, décidé par la présence de DATABASE_URL :
 * avec une base Postgres, les documents sont en ligne et l'accès est protégé par mot de passe ;
 * sans base, tout reste dans le navigateur de chacun, sans connexion.
 */
export function storageMode(): StorageMode {
  return process.env.DATABASE_URL ? 'cloud' : 'local'
}
