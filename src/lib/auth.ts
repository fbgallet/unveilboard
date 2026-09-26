// Authentification minimale pour un usage personnel : un mot de passe (APP_PASSWORD)
// et un cookie de session signé (HMAC). Web Crypto uniquement : fonctionne dans le proxy
// comme dans les routes. À remplacer par de vrais comptes quand l'app deviendra publique.

export const SESSION_COOKIE = 'session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180 // 180 jours

const encoder = new TextEncoder()

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or too short (32 characters minimum)')
  return s
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return Buffer.from(sig).toString('base64url')
}

/** Comparaison en temps constant de deux chaînes (via leurs empreintes). */
async function safeEqual(a: string, b: string) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

export async function createSessionToken() {
  const payload = `v1.${Date.now() + SESSION_MAX_AGE * 1000}`
  return `${payload}.${await hmac(payload)}`
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return false
  const i = token.lastIndexOf('.')
  if (i < 0) return false
  const payload = token.slice(0, i)
  const [version, exp] = payload.split('.')
  if (version !== 'v1' || !(Number(exp) > Date.now())) return false
  return safeEqual(token.slice(i + 1), await hmac(payload))
}

export async function checkPassword(candidate: string) {
  const expected = process.env.APP_PASSWORD
  if (!expected) return false
  return safeEqual(candidate, expected)
}
