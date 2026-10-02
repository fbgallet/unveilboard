// Connexion à un compte ChatGPT (« Sign in with ChatGPT ») : l'IA d'Unveilboard utilise alors le
// forfait ChatGPT de l'utilisateur, sans clé d'API. Dans le processus principal seulement : les jetons
// n'atteignent jamais les pages, qui demandent les appels par IPC (preload.js) et reçoivent le flux.
//
// Implémentation indépendante, d'après la documentation publique d'OpenAI :
// https://developers.openai.com/siwc/token-sharing-open-source (inscription et connexion, comptes et
// sessions, modèles et inférence, erreurs, limites de l'aperçu). Réservé aux applications open source
// qui tournent sur la machine de l'utilisateur : c'est le cas de l'application de bureau.

const { app, ipcMain, safeStorage, shell, webContents } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')

const ISSUER = 'https://auth.openai.com'
const API = 'https://api.openai.com/v1'
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
/** Permission d'utiliser le forfait : sans elle, la connexion vaut identité seulement. */
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'
/** Première inscription : l'identifiant de client définitif est renvoyé au retour. */
const REGISTRATION_CLIENT = 'dynamic_agent_client'
const APP_NAME = 'Unveilboard'
const CALLBACK_PATH = '/auth/callback'
/**
 * Envoyer l'identifiant d'installation (`ext_agent_host_id`). La documentation le dit requis, mais le
 * kit d'OpenAI ne l'envoie que « pour un déploiement d'autorisation compatible » (désactivé par
 * défaut) : on fait comme le kit. L'identifiant est tout de même créé, prêt à servir.
 */
const SEND_HOST_ID = false
const SIGN_IN_TIMEOUT = 10 * 60 * 1000
/** Jeton d'accès renouvelé un peu avant son expiration (il vaut une heure). */
const REFRESH_MARGIN = 2 * 60 * 1000
/** Échecs de renouvellement définitifs : il faut se reconnecter (documentation, « Refresh errors »). */
const DEAD_REFRESH = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
  'invalid_client',
])
/** Champs de requête que cette route refuse (documentation, « Preview limitations »). */
const ALLOWED_FIELDS = new Set(['model', 'input', 'instructions', 'reasoning', 'text', 'tools', 'tool_choice', 'include', 'parallel_tool_calls'])

class ChatGptError extends Error {
  constructor(code, message, status) {
    super(message || code)
    this.code = code
    this.status = status
  }
}

const random = () => crypto.randomBytes(32).toString('base64url')
const fr = () => app.getLocale().startsWith('fr')

// ---------- Stockage (dossier de données de l'application) ----------

const dir = () => path.join(app.getPath('userData'), 'chatgpt')
const accountFile = () => path.join(dir(), 'account.bin')
const hostFile = () => path.join(dir(), 'host.json')

/** Chiffrement du système (Trousseau macOS, DPAPI Windows, trousseau Linux) ; jamais de repli en clair. */
function canEncrypt() {
  if (!safeStorage.isEncryptionAvailable()) return false
  // Linux sans trousseau : Electron « chiffre » avec une clé fixe, ce qui ne protège rien.
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

async function writePrivate(file, data) {
  await fs.mkdir(dir(), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, data, { mode: 0o600 })
  await fs.rename(tmp, file)
}

/** Identifiant opaque et stable de cette installation (`ext_agent_host_id`), créé une fois. */
async function hostId() {
  try {
    const { id } = JSON.parse(await fs.readFile(hostFile(), 'utf8'))
    if (typeof id === 'string' && id.startsWith('urn:uuid:')) return id
  } catch {
    // Premier lancement.
  }
  const id = `urn:uuid:${crypto.randomUUID()}`
  await writePrivate(hostFile(), JSON.stringify({ id }))
  return id
}

/**
 * Le compte enregistré : identifiant de client délivré à l'inscription, identité vérifiée, jetons.
 * En mémoire, et sur disque chiffré quand le système le permet (sinon, le temps de la séance).
 */
let account = null
let loaded = false

async function loadAccount() {
  if (loaded) return account
  loaded = true
  try {
    const data = await fs.readFile(accountFile())
    if (canEncrypt()) account = JSON.parse(safeStorage.decryptString(data))
  } catch {
    account = null
  }
  return account
}

async function saveAccount(next) {
  account = next
  if (!canEncrypt()) return
  if (!next) {
    await fs.rm(accountFile(), { force: true })
    return
  }
  await writePrivate(accountFile(), safeStorage.encryptString(JSON.stringify(next)))
}

/** Sans les jetons, en gardant l'inscription (client, identité) pour une prochaine connexion. */
function withoutTokens(record) {
  const rest = { ...record }
  delete rest.accessToken
  delete rest.refreshToken
  delete rest.expiresAt
  return rest
}

// ---------- État transmis aux pages (jamais de jeton) ----------

let pending = null // connexion en cours : { abort }
let lastError = null

function publicState() {
  const connected = !!account?.refreshToken
  return {
    status: pending ? 'connecting' : connected ? 'connected' : account?.subject ? 'signed_out' : 'none',
    email: account?.email,
    name: account?.name,
    planUsage: connected && (account.scopes ?? []).includes(PLAN_SCOPE),
    persistent: canEncrypt(),
    ...(lastError && { error: lastError }),
  }
}

let isTrusted = () => false

function broadcast() {
  const state = publicState()
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed() && isTrusted(contents.getURL())) contents.send('chatgpt:state', state)
  }
}

const errorInfo = (e) => ({ code: e instanceof ChatGptError ? e.code : 'network', message: e instanceof Error ? e.message : String(e), status: e?.status })

// ---------- Protocole OAuth ----------

let discovery = null

/** Configuration OpenID d'OpenAI ; chaque adresse doit rester sur auth.openai.com. */
async function config() {
  if (discovery) return discovery
  const res = await fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) })
  const json = await res.json().catch(() => null)
  const keys = ['authorization_endpoint', 'token_endpoint', 'jwks_uri']
  if (!res.ok || json?.issuer !== ISSUER || !keys.every((k) => typeof json[k] === 'string' && new URL(json[k]).origin === ISSUER)) {
    throw new ChatGptError('discovery', 'OpenAI sign-in configuration could not be verified.')
  }
  if (json.revocation_endpoint && new URL(json.revocation_endpoint).origin !== ISSUER) delete json.revocation_endpoint
  discovery = json
  return json
}

let jwks = null

/** Vérifie l'ID token : signature (JWKS d'OpenAI), émetteur, audience (le client), expiration, nonce. */
async function verifyIdToken(idToken, clientId, nonce) {
  const { createRemoteJWKSet, jwtVerify } = await import('jose')
  const { jwks_uri } = await config()
  jwks ??= createRemoteJWKSet(new URL(jwks_uri))
  let payload
  try {
    ;({ payload } = await jwtVerify(idToken, jwks, { issuer: ISSUER, audience: clientId, algorithms: ['RS256'], clockTolerance: 5 }))
  } catch (e) {
    throw new ChatGptError('invalid_id_token', `The ChatGPT identity could not be verified (${e?.code ?? e?.message ?? e}).`)
  }
  if (typeof payload.sub !== 'string' || !payload.sub || (nonce !== undefined && payload.nonce !== nonce)) {
    throw new ChatGptError('invalid_id_token', 'The ChatGPT identity could not be verified.')
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  }
}

async function tokenRequest(params, signal) {
  const { token_endpoint } = await config()
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
    signal: signal ?? AbortSignal.timeout(30_000),
  })
  const body = await res.text().catch(() => '')
  let json = null
  try {
    json = JSON.parse(body)
  } catch {
    // Réponse non JSON (page d'erreur) : gardée telle quelle, en extrait, comme détail.
  }
  if (!res.ok || !json) {
    const code = typeof json?.error === 'string' ? json.error : (json?.error?.code ?? 'token_error')
    const description = json?.error_description ?? json?.error?.message ?? (json ? '' : body.replace(/\s+/g, ' ').slice(0, 200))
    // Diagnostic sans secret : la réponse d'erreur ne contient pas de jeton.
    console.warn(`ChatGPT : ${params.grant_type} refusé (${res.status}) : ${code}${description ? ` : ${description}` : ''}`)
    throw new ChatGptError(code, `${code}${description ? ` : ${description}` : ''} (${res.status})`, res.status)
  }
  return json
}

/** Jetons d'une réponse du point de terminaison, vérifiés et prêts à enregistrer. */
function tokensOf(json, previousScopes) {
  const scopes = (typeof json.scope === 'string' ? json.scope : (previousScopes ?? []).join(' ')).split(/\s+/).filter(Boolean)
  if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string' || !(json.expires_in > 0)) {
    throw new ChatGptError('invalid_token_response', 'ChatGPT returned incomplete credentials.')
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + json.expires_in * 1000, scopes }
}

/** Page affichée dans le navigateur au retour de la connexion. */
function callbackPage(ok) {
  const [title, text] = fr()
    ? ok
      ? ['Retournez dans Unveilboard', 'La connexion à ChatGPT se termine dans l’application. Vous pouvez fermer cet onglet.']
      : ['Connexion interrompue', 'Retournez dans Unveilboard pour réessayer. Vous pouvez fermer cet onglet.']
    : ok
      ? ['Return to Unveilboard', 'The app is finishing your ChatGPT connection. You can close this tab.']
      : ['Sign-in interrupted', 'Return to Unveilboard to try again. You can close this tab.']
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:17px system-ui,sans-serif;max-width:32rem;margin:18vh auto;padding:24px;color:#1c1917}</style><h1>${title}</h1><p>${text}</p>`
}

/**
 * Écoute le retour du navigateur sur la boucle locale (127.0.0.1, port libre, /auth/callback).
 * Les requêtes étrangères (mauvais chemin, état différent) sont ignorées sans clore la tentative.
 */
async function listen(state, signal) {
  let settle
  const result = new Promise((resolve, reject) => (settle = { resolve, reject }))
  result.catch(() => {})
  const server = http.createServer((req, res) => {
    const port = server.address().port
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}` || url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end()
      return
    }
    const got = Buffer.from(url.searchParams.get('state') ?? '')
    const want = Buffer.from(state)
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
      res.writeHead(400).end()
      return
    }
    const error = url.searchParams.get('error')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" })
    res.end(callbackPage(!error))
    if (error) settle.reject(new ChatGptError(error, url.searchParams.get('error_description') ?? error))
    else settle.resolve({ code: url.searchParams.get('code'), clientId: url.searchParams.get('client_id') })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const close = () => {
    server.close()
    server.closeAllConnections()
  }
  const timer = setTimeout(() => settle.reject(new ChatGptError('timeout', 'Sign-in took too long.')), SIGN_IN_TIMEOUT)
  signal.addEventListener('abort', () => settle.reject(new ChatGptError('cancelled', 'Sign-in was cancelled.')), { once: true })
  result.finally(() => clearTimeout(timer)).catch(() => {})
  return { result, close, redirectUri: `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}` }
}

/**
 * Connexion dans le navigateur du système. Première fois (ou autre compte) : inscription d'Unveilboard
 * auprès du compte (`dynamic_agent_client`). Ensuite : le client délivré, avec l'identité retenue.
 * `consent` redemande l'autorisation d'utiliser le forfait (refusée la première fois).
 */
async function signIn({ newAccount = false, consent = false } = {}, focusApp) {
  pending?.abort()
  const controller = new AbortController()
  pending = controller
  lastError = null
  broadcast()
  const previous = newAccount ? null : await loadAccount()
  const registered = previous?.clientId
  try {
    const { authorization_endpoint } = await config()
    const state = random()
    const nonce = random()
    const verifier = random()
    const listener = await listen(state, controller.signal)
    try {
      const url = new URL(authorization_endpoint)
      const params = {
        client_id: registered ?? REGISTRATION_CLIENT,
        response_type: 'code',
        redirect_uri: listener.redirectUri,
        scope: SCOPES,
        resource: API,
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        ...(SEND_HOST_ID && { ext_agent_host_id: await hostId() }),
        // Reconnexion : l'adresse e-mail seulement ; pas d'ID token dans une adresse passée au navigateur.
        ...(registered ? previous.email && { login_hint: previous.email } : { agent_name_hint: APP_NAME }),
        ...(consent && { prompt: 'consent' }),
      }
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      await shell.openExternal(url.toString())
      const callback = await listener.result
      // Nouvelle inscription : le client délivré arrive avec le code. Reconnexion : le même, ou rien.
      const clientId = registered ?? callback.clientId
      if (!callback.code || !clientId || clientId === REGISTRATION_CLIENT || (registered && callback.clientId && callback.clientId !== registered)) {
        throw new ChatGptError('registration_incomplete', 'ChatGPT did not complete the registration. Try again.')
      }
      // Inscription gardée avant l'échange du code : s'il échoue, le nouvel essai réutilise ce client
      // au lieu d'inscrire Unveilboard une seconde fois (documentation, « Handle the callback »).
      if (!registered) await saveAccount({ clientId })
      const json = await tokenRequest(
        { grant_type: 'authorization_code', client_id: clientId, code: callback.code, code_verifier: verifier, redirect_uri: listener.redirectUri, resource: API },
        controller.signal
      )
      if (typeof json.id_token !== 'string') throw new ChatGptError('invalid_id_token', 'ChatGPT did not return a verifiable identity.')
      const identity = await verifyIdToken(json.id_token, clientId, nonce)
      if (registered && previous.subject && identity.subject !== previous.subject) {
        throw new ChatGptError('account_mismatch', 'This is a different ChatGPT account. Use “Change account” to switch.')
      }
      await saveAccount({ clientId, ...identity, idToken: json.id_token, ...tokensOf(json) })
    } finally {
      listener.close()
    }
  } catch (e) {
    if (!(e instanceof ChatGptError && e.code === 'cancelled')) lastError = errorInfo(e)
  } finally {
    if (pending === controller) pending = null
    focusApp?.()
    broadcast()
  }
  return publicState()
}

let refreshing = null

/** Jeton d'accès valide, renouvelé au besoin (un seul renouvellement à la fois : le jeton tourne). */
async function accessToken({ force = false } = {}) {
  const current = await loadAccount()
  if (!current?.refreshToken) throw new ChatGptError('signin', 'Sign in to ChatGPT.')
  if (!force && current.expiresAt - REFRESH_MARGIN > Date.now()) return current.accessToken
  refreshing ??= (async () => {
    try {
      const json = await tokenRequest({ grant_type: 'refresh_token', client_id: current.clientId, refresh_token: current.refreshToken, resource: API })
      let identity = {}
      if (typeof json.id_token === 'string') {
        identity = await verifyIdToken(json.id_token, current.clientId)
        if (identity.subject !== current.subject) throw new ChatGptError('account_mismatch', 'The refreshed identity does not match this account.')
        identity.idToken = json.id_token
      }
      await saveAccount({ ...current, ...identity, ...tokensOf(json, current.scopes) })
      return account.accessToken
    } catch (e) {
      if (e instanceof ChatGptError && (DEAD_REFRESH.has(e.code) || e.code === 'account_mismatch')) {
        await saveAccount(withoutTokens(current))
        lastError = { code: 'signin', message: e.message }
        broadcast()
        throw new ChatGptError('signin', 'Your ChatGPT connection has expired. Sign in again.')
      }
      throw e
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Déconnexion : révoque la session renouvelable, efface les jetons, garde l'inscription. */
async function signOut() {
  const current = await loadAccount()
  let revoked = true
  if (current?.refreshToken) {
    revoked = false
    try {
      const { revocation_endpoint } = await config()
      for (let attempt = 0; attempt < 2 && revocation_endpoint && !revoked; attempt++) {
        const res = await fetch(revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: current.refreshToken, token_type_hint: 'refresh_token', client_id: current.clientId }),
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null)
        revoked = res?.status === 200
        if (res && res.status < 500) break
      }
    } catch {
      // Révocation non confirmée : signalé à l'utilisateur.
    }
    await saveAccount(withoutTokens(current))
  }
  lastError = null
  broadcast()
  return { state: publicState(), revoked }
}

// ---------- Modèles et inférence ----------

/** En-tête Authorization, avec un nouvel essai après renouvellement si le jeton est refusé (401). */
async function authorizedFetch(url, init) {
  let res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` } })
  if (res.status === 401) {
    await res.body?.cancel().catch(() => {})
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken({ force: true })}` } })
  }
  return res
}

/** Modèles du forfait de ce compte, dans l'ordre du serveur (ceux à afficher seulement). */
async function listModels() {
  const res = await authorizedFetch(`${API}/models`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  const json = await res.json().catch(() => null)
  if (!res.ok || !Array.isArray(json?.models)) throw new ChatGptError('models', `The model list is unavailable (${res.status}).`, res.status)
  return json.models
    .filter((m) => m?.visibility === 'list' && typeof m.slug === 'string' && typeof m.display_name === 'string')
    .map((m) => ({ slug: m.slug, displayName: m.display_name }))
}

const requests = new Map()

/**
 * Demande à l'API Responses, en flux. Toujours `store: false` et `stream: true` ; seuls les champs
 * acceptés par cette route passent. Le flux brut (SSE) est relayé à la page, qui le lit.
 */
async function respond(sender, id, body) {
  const controller = new AbortController()
  requests.set(id, controller)
  try {
    if (!body || typeof body !== 'object' || typeof body.model !== 'string' || !Array.isArray(body.input)) {
      throw new ChatGptError('invalid_request', 'Invalid request.')
    }
    const payload = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_FIELDS.has(k)))
    const res = await authorizedFetch(`${API}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...payload, store: false, stream: true }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      return { ok: false, status: res.status, body: (await res.text().catch(() => '')).slice(0, 4000), requestId: res.headers.get('x-request-id') }
    }
    const decoder = new TextDecoder()
    for await (const chunk of res.body) {
      if (sender.isDestroyed()) break
      sender.send('chatgpt:chunk', id, decoder.decode(chunk, { stream: true }))
    }
    return { ok: true }
  } catch (e) {
    if (controller.signal.aborted) return { ok: false, error: { code: 'aborted', message: 'Stopped.' } }
    return { ok: false, error: errorInfo(e) }
  } finally {
    requests.delete(id)
  }
}

// ---------- IPC ----------

/**
 * Branche les échanges avec les pages. `trusted(url)` : seules les pages de l'application y ont accès
 * (pas une page extérieure ouverte dans une fenêtre, comme la connexion à OpenRouter).
 */
function setupChatGpt({ trusted, focusApp }) {
  isTrusted = trusted
  const guard =
    (handler) =>
    (event, ...args) => {
      if (!trusted(event.senderFrame?.url ?? '')) throw new Error('Untrusted sender')
      return handler(event, ...args)
    }
  ipcMain.handle('chatgpt:state', guard(async () => (await loadAccount(), publicState())))
  ipcMain.handle('chatgpt:sign-in', guard((_e, options) => signIn({ newAccount: !!options?.newAccount, consent: !!options?.consent }, focusApp)))
  ipcMain.handle('chatgpt:cancel-sign-in', guard(() => (pending?.abort(), publicState())))
  ipcMain.handle('chatgpt:sign-out', guard(() => signOut()))
  ipcMain.handle(
    'chatgpt:models',
    guard(async () => {
      try {
        return { ok: true, models: await listModels() }
      } catch (e) {
        return { ok: false, error: errorInfo(e) }
      }
    })
  )
  ipcMain.handle('chatgpt:request', guard((event, id, body) => respond(event.sender, String(id), body)))
  ipcMain.handle('chatgpt:abort', guard((_e, id) => requests.get(String(id))?.abort()))
}

module.exports = { setupChatGpt }
