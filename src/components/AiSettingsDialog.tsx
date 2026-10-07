'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { atom, useValue } from 'tldraw'
import { useT } from '@/i18n/client'
import type { Messages } from '@/i18n/config'
import {
  PROVIDERS,
  aiSettingsAtom,
  isKeyRemembered,
  listModels,
  readKey,
  saveAiSettings,
  serverAiAtom,
  startOpenRouterLogin,
  testAi,
  writeKey,
  type AiSettings,
  type ProviderKind,
} from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'
import { MODELS } from '@/lib/ai/models'
import { REASONING_EFFORTS, type ReasoningEffort } from '@/lib/ai/chat'
import { DiagramSizeFields } from './DiagramSize'
import { ContentLangSelect } from './ContentLanguage'
import {
  CHATGPT_USAGE_URL,
  cancelChatGptSignIn,
  chatGptAvailable,
  chatGptStateAtom,
  listChatGptModels,
  signInChatGpt,
  signOutChatGpt,
  type ChatGptModel,
} from '@/lib/ai/chatgpt'
import { DESKTOP_DOWNLOAD_URL, isDesktop } from '@/lib/desktop'

export const aiSettingsOpenAtom = atom<boolean>('aiSettingsOpen', false)

/** Nom et tarif d'un modèle du catalogue (« DeepSeek V4.1 flash · 0,3 / 1,2 $ par M de jetons »), sinon son identifiant. */
function modelLabel(id: string, t: Messages) {
  const m = MODELS.find((c) => c.id === id)
  if (!m) return id
  return m.price ? `${m.label} · ${t.ai.price(m.price.input, m.price.output)}` : m.label
}

/** Réglages de l'IA : fournisseur, clé, modèle, essai. Tout reste sur cet appareil. */
export function AiSettingsDialog() {
  const open = useValue(aiSettingsOpenAtom)
  if (!open) return null
  return <AiSettingsView />
}

function AiSettingsView() {
  const t = useT()
  const server = useValue(serverAiAtom)
  const [draft, setDraft] = useState<AiSettings>(() => aiSettingsAtom.get())
  const [keys, setKeys] = useState({ openrouter: readKey('openrouter'), custom: readKey('custom') })
  const [remember, setRemember] = useState(() => isKeyRemembered('openrouter') || isKeyRemembered('custom'))
  const [models, setModels] = useState<string[] | null>(null)
  const [test, setTest] = useState<{ state: 'running' | 'ok' | 'invalid' | 'error'; text: string } | null>(null)
  const close = () => aiSettingsOpenAtom.set(false)
  const kinds = PROVIDERS.filter((k) => (k !== 'server' || server) && (k !== 'chatgpt' || chatGptAvailable()))
  const set = (patch: Partial<AiSettings>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setTest(null)
  }

  /** Enregistre réglages et clés (les essais et la liste des modèles s'en servent). */
  function persist(next = draft) {
    saveAiSettings(next)
    writeKey('openrouter', keys.openrouter, remember)
    writeKey('custom', keys.custom, remember)
  }

  async function runTest() {
    persist()
    setTest({ state: 'running', text: t.ai.testing })
    try {
      const r = await testAi(draft)
      setTest(r.ok ? { state: 'ok', text: t.ai.testOk(r.model ?? '', r.ms) } : { state: 'invalid', text: t.ai.testInvalid })
    } catch (e) {
      const error = toAiError(e)
      setTest({ state: 'error', text: `${t.ai.errors[error.kind]}${error.detail ? ` (${error.detail})` : ''}` })
    }
  }

  async function loadModels() {
    persist()
    setModels(await listModels(draft))
  }

  const modelField = (value: string, onChange: (v: string) => void) => (
    <label className="grid gap-1">
      <span className="text-xs text-zinc-500">{t.ai.model}</span>
      <span className="flex gap-2">
        <input className="preset-input flex-1" list="ai-models" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t.ai.model} />
        <button className="btn-xs" onClick={() => void loadModels()}>
          {t.ai.loadModels}
        </button>
      </span>
      <datalist id="ai-models">
        {/* Le catalogue (src/lib/ai/models.json) d'abord, puis la liste du serveur. */}
        {(draft.kind === 'openrouter' ? MODELS.map((m) => m.id) : [])
          .concat((models ?? []).filter((m) => !MODELS.some((c) => c.id === m)))
          .map((m) => (
            <option key={m} value={m} label={modelLabel(m, t)} />
          ))}
      </datalist>
      {models && <span className="text-xs text-zinc-500">{models.length ? t.ai.modelsLoaded(models.length) : t.ai.noModels}</span>}
    </label>
  )

  const keyField = (kind: 'openrouter' | 'custom', label: string) => (
    <label className="grid gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        className="preset-input"
        type="password"
        // « off » est ignoré sur un mot de passe : le navigateur y mettrait celui du compte (cloud).
        autoComplete="new-password"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        spellCheck={false}
        value={keys[kind]}
        onChange={(e) => {
          setKeys((k) => ({ ...k, [kind]: e.target.value }))
          setTest(null)
        }}
        aria-label={label}
      />
      {kind === 'openrouter' && keys.openrouter.trim() && !keys.openrouter.trim().startsWith('sk-or-') && (
        <span className="text-xs text-red-700">{t.ai.keyNotOpenRouter}</span>
      )}
    </label>
  )

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog share-dialog" role="dialog" aria-label={t.ai.settingsTitle}>
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.ai.settingsTitle}</h2>
          <button className="preset-icon" onClick={close} aria-label={t.common.close}>
            ✕
          </button>
        </header>
        <p className="text-xs text-zinc-500">{t.ai.intro}</p>
        <div className="grid gap-1" role="radiogroup" aria-label={t.ai.settingsTitle}>
          {kinds.map((k: ProviderKind) => (
            <label key={k} className="flex items-start gap-2 text-sm">
              <input type="radio" name="ai-provider" className="mt-1" checked={draft.kind === k} onChange={() => set({ kind: k })} />
              <span>
                {t.ai.providers[k]}
                {draft.kind === k && <span className="block text-xs text-zinc-500">{t.ai.providerHints[k]}</span>}
              </span>
            </label>
          ))}
        </div>
        {!isDesktop() && (
          <p className="text-xs text-zinc-500">
            {t.ai.chatgptDesktopOnly}{' '}
            <a className="underline" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              {t.ai.downloadDesktop}
            </a>
          </p>
        )}

        {draft.kind === 'server' && server && (
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">{t.ai.model}</span>
            <select
              className="preset-input"
              value={server.models.includes(draft.serverModel) ? draft.serverModel : server.model}
              onChange={(e) => set({ serverModel: e.target.value })}
              aria-label={t.ai.model}
            >
              {server.models.map((m) => (
                <option key={m} value={m}>
                  {modelLabel(m, t)}
                </option>
              ))}
            </select>
          </label>
        )}

        {draft.kind === 'chatgpt' && <ChatGptSection model={draft.chatgptModel} onModel={(slug) => set({ chatgptModel: slug })} />}

        {draft.kind === 'openrouter' && (
          <section className="share-section">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn"
                onClick={() => {
                  persist()
                  void startOpenRouterLogin(location.pathname + location.search, remember)
                }}
              >
                {t.ai.connectOpenRouter}
              </button>
              <span className="text-xs text-zinc-500">{t.ai.connectHint}</span>
            </div>
            <span className="text-xs text-zinc-500">{t.ai.orPasteKey}</span>
            {keyField('openrouter', t.ai.key)}
            {modelField(draft.openrouterModel, (v) => set({ openrouterModel: v }))}
          </section>
        )}

        {draft.kind === 'custom' && (
          <section className="share-section">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">{t.ai.url}</span>
              <input className="preset-input" value={draft.customUrl} onChange={(e) => set({ customUrl: e.target.value })} aria-label={t.ai.url} />
            </label>
            {keyField('custom', t.ai.keyOptional)}
            {modelField(draft.customModel, (v) => set({ customModel: v }))}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.customJsonMode} onChange={(e) => set({ customJsonMode: e.target.checked })} />
              {t.ai.jsonMode}
            </label>
            <p className="text-xs text-zinc-500">{t.ai.corsHint(location.origin)}</p>
          </section>
        )}

        {(draft.kind === 'openrouter' || draft.kind === 'custom') && (
          <>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              {t.ai.remember}
            </label>
            <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{t.ai.keyWarning}</p>
          </>
        )}

        {draft.kind !== 'clipboard' && (
          <>
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">{t.ai.reasoning}</span>
              <select
                className="preset-input"
                value={draft.reasoning}
                onChange={(e) => set({ reasoning: e.target.value as ReasoningEffort })}
                aria-label={t.ai.reasoning}
              >
                {REASONING_EFFORTS.map((r) => (
                  <option key={r} value={r}>
                    {t.ai.reasoningLevels[r]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">{t.ai.reasoningHint}</span>
            </label>
            <p className="text-xs text-zinc-500">{t.ai.privacy}</p>
            <div className="flex items-center gap-3">
              <button className="btn" disabled={test?.state === 'running'} onClick={() => void runTest()}>
                {t.ai.test}
              </button>
              {test && (
                <span
                  className={`text-xs ${test.state === 'ok' ? 'text-emerald-700' : test.state === 'running' ? 'text-zinc-500' : 'text-red-700'}`}
                  role="status"
                >
                  {test.text}
                </span>
              )}
            </div>
          </>
        )}

        {/* Taille des schémas créés : vaut aussi pour une consigne copiée (elle y est écrite). */}
        <section className="grid gap-1 border-t border-zinc-200 pt-3">
          <h3 className="preset-group-title">{t.ai.size.title}</h3>
          <DiagramSizeFields size={draft.size} onChange={(size) => set({ size })} />
          <span className="text-xs text-zinc-500">{t.ai.size.hint}</span>
        </section>
        <section className="grid gap-1 border-t border-zinc-200 pt-3">
          <h3 className="preset-group-title">{t.ai.lang.title}</h3>
          <ContentLangSelect value={draft.contentLang} onChange={(contentLang) => set({ contentLang })} />
          <span className="text-xs text-zinc-500">{t.ai.lang.hint}</span>
        </section>

        <footer className="flex justify-end gap-2">
          <button className="btn" onClick={close}>
            {t.common.cancel}
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              persist()
              close()
            }}
          >
            {t.ai.save}
          </button>
        </footer>
      </div>
    </div>
  )
}

const WELCOME_KEY = 'chatgpt-welcome-seen'
/** Échecs de connexion qui, en pratique, viennent d'un forfait ChatGPT gratuit. */
const PLAN_REFUSALS = new Set(['invalid_grant', 'access_denied', 'unauthorized_client'])

/**
 * Connexion à ChatGPT (application de bureau) : bouton « Continuer avec ChatGPT », compte connecté,
 * modèles du forfait, lien « Gérer l'usage », et un mot d'accueil à la première connexion — d'après les
 * consignes d'interface d'OpenAI. Les jetons restent dans le processus principal d'Electron.
 */
function ChatGptSection({ model, onModel }: { model: string; onModel: (slug: string) => void }) {
  const t = useT()
  const state = useValue(chatGptStateAtom)
  const [models, setModels] = useState<ChatGptModel[] | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [welcome, setWelcome] = useState(false)
  const ready = state?.status === 'connected' && state.planUsage
  const who = state?.email ?? state?.name ?? ''

  // Premier modèle du catalogue si aucun (ou un autre compte) n'est choisi.
  const pickDefault = useEffectEvent((list: ChatGptModel[]) => {
    if (list[0] && !list.some((m) => m.slug === model)) onModel(list[0].slug)
  })
  useEffect(() => {
    if (!ready) return
    let live = true
    listChatGptModels()
      .then((list) => {
        if (!live) return
        setModels(list)
        setModelsError(null)
        pickDefault(list)
      })
      .catch((e) => live && setModelsError(toAiError(e).detail ?? t.ai.chatgpt.noModels))
    return () => {
      live = false
    }
  }, [ready, who, t])

  async function signIn(options?: { newAccount?: boolean; consent?: boolean }) {
    setNotice(null)
    await signInChatGpt(options)
    const next = chatGptStateAtom.get()
    let seen = true
    try {
      seen = !!localStorage.getItem(WELCOME_KEY)
    } catch {
      // Stockage indisponible : pas de mot d'accueil.
    }
    if (next?.status === 'connected' && next.planUsage && !seen) setWelcome(true)
  }

  async function signOut() {
    const revoked = await signOutChatGpt()
    // Plus de modèle : l'IA n'est plus « prête » ailleurs dans l'application.
    saveAiSettings({ ...aiSettingsAtom.get(), chatgptModel: '' })
    onModel('')
    setModels(null)
    setNotice(revoked ? null : t.ai.chatgpt.revokeFailed)
  }

  function dismissWelcome() {
    setWelcome(false)
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // Stockage indisponible.
    }
  }

  const usageLink = (
    <a className="underline" href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer">
      {t.ai.chatgpt.manageUsage}
    </a>
  )

  return (
    <section className="share-section">
      {state?.status === 'connecting' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{t.ai.chatgpt.waiting}</span>
          <button className="btn-xs" onClick={() => void cancelChatGptSignIn()}>
            {t.ai.chatgpt.cancel}
          </button>
        </div>
      ) : state?.status !== 'connected' ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => void signIn()}
          >
            {t.ai.chatgpt.continue}
          </button>
          {state?.status === 'signed_out' && who && <span className="text-xs text-zinc-500">{t.ai.chatgpt.signedOut(who)}</span>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">{t.ai.chatgpt.connectedAs(who)}</span>
            <span className="flex gap-2">
              <button className="btn-xs" onClick={() => void signIn({ newAccount: true })}>
                {t.ai.chatgpt.changeAccount}
              </button>
              <button className="btn-xs" onClick={() => void signOut()}>
                {t.ai.chatgpt.signOut}
              </button>
            </span>
          </div>
          {!state.planUsage ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>{t.ai.chatgpt.noPlanUsage}</span>
              <button className="btn-xs" onClick={() => void signIn({ consent: true })}>
                {t.ai.chatgpt.allow}
              </button>
            </div>
          ) : (
            <>
              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">{t.ai.model}</span>
                {models?.length ? (
                  <select className="preset-input" value={model} onChange={(e) => onModel(e.target.value)} aria-label={t.ai.model}>
                    {models.map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-zinc-500">{modelsError ?? (models ? t.ai.chatgpt.noModels : t.ai.chatgpt.loadingModels)}</span>
                )}
                {!!models?.length && <span className="text-xs text-zinc-500">{t.ai.chatgpt.modelsHint}</span>}
              </label>
              <p className="text-xs text-zinc-500">
                {t.ai.chatgpt.inUse} · {usageLink}
              </p>
            </>
          )}
        </>
      )}
      {state?.error && (
        <p className="text-xs text-red-700">
          {/* Refus de l'autorisation, ou échange du code refusé : en pratique, un forfait gratuit. */}
          {PLAN_REFUSALS.has(state.error.code) ? `${t.ai.chatgpt.planRequired} (${state.error.code})` : t.ai.chatgpt.failed(state.error.message)}
        </p>
      )}
      {state && !state.persistent && <p className="text-xs text-amber-800">{t.ai.chatgpt.notPersistent}</p>}
      {notice && <p className="text-xs text-amber-800">{notice}</p>}
      {welcome && (
        <div role="status" className="grid gap-1 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
          <strong>{t.ai.chatgpt.welcomeTitle}</strong>
          <span>
            {t.ai.chatgpt.welcomeText} {usageLink}
          </span>
          <button className="btn-xs justify-self-end" onClick={dismissWelcome}>
            {t.ai.chatgpt.gotIt}
          </button>
        </div>
      )}
    </section>
  )
}
