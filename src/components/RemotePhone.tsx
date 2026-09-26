'use client'

import type { DataConnection, Peer } from 'peerjs'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useT } from '@/i18n/client'
import {
  connectionKind,
  isHostId,
  REMOTE_CONNECT_TIMEOUT_MS,
  type ConnectionKind,
  type HostMessage,
  type PhoneMessage,
  type RemoteCommand,
  type RemoteState,
} from '@/lib/remote/protocol'
import { LogoMark } from './Logo'
import { Markdownish } from './Markdownish'

type Status =
  | { state: 'connecting' }
  | { state: 'connected'; kind: ConnectionKind }
  | { state: 'failed'; reason: 'invalid' | 'gone' | 'service' | 'ice' }

/** Télécommande sur téléphone : se connecte directement à l'ordinateur (PeerJS / WebRTC). */
export function RemotePhone() {
  const t = useT()
  const [status, setStatus] = useState<Status>({ state: 'connecting' })
  const [state, setState] = useState<RemoteState | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const connection = useRef<DataConnection | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Identifiant de l'ordinateur, dans le fragment de l'URL (null pendant le rendu serveur).
  const hostId = useSyncExternalStore(subscribeHash, () => location.hash.slice(1), () => null)
  const invalid = hostId !== null && !isHostId(hostId)
  const shown: Status = invalid ? { state: 'failed', reason: 'invalid' } : status

  useEffect(() => {
    if (!hostId || !isHostId(hostId)) return
    let peer: Peer | null = null
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | undefined

    void import('peerjs').then(({ Peer }) => {
      if (cancelled) return
      peer = new Peer({ debug: 0 })
      peer.on('error', (err) => {
        const type = (err as { type?: string }).type
        setStatus((s) =>
          s.state === 'connected' ? s : { state: 'failed', reason: type === 'peer-unavailable' ? 'gone' : type === 'webrtc' ? 'ice' : 'service' }
        )
      })
      peer.on('open', () => {
        const conn = peer!.connect(hostId, { reliable: true })
        connection.current = conn
        timeout = setTimeout(() => {
          if (!conn.open) setStatus({ state: 'failed', reason: 'ice' })
        }, REMOTE_CONNECT_TIMEOUT_MS)
        conn.on('open', async () => {
          clearTimeout(timeout)
          setStatus({ state: 'connected', kind: await connectionKind(conn.peerConnection) })
        })
        conn.on('data', (data) => {
          const message = data as HostMessage
          if (message?.type !== 'state') return
          setState(message.state)
          setStartedAt(Date.now() - message.state.elapsedMs)
        })
        conn.on('close', () => setStatus({ state: 'failed', reason: 'gone' }))
      })
    })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      connection.current = null
      peer?.destroy()
    }
  }, [hostId, attempt])

  // L'écran du téléphone reste allumé pendant la présentation.
  useEffect(() => {
    if (status.state !== 'connected' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const request = () => {
      if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      document.removeEventListener('visibilitychange', request)
      void lock?.release().catch(() => {})
    }
  }, [status.state])

  const send = useCallback((command: RemoteCommand) => {
    const conn = connection.current
    if (!conn?.open) return
    const message: PhoneMessage = { type: 'command', command }
    conn.send(message)
    navigator.vibrate?.(10)
  }, [])

  const connected = shown.state === 'connected'
  const presenting = connected && state?.presenting

  return (
    <main className="site flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 text-xs text-stone-500">
        <LogoMark className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{state?.title || 'Unveilboard'}</span>
        {presenting && <Timer startedAt={startedAt} />}
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {shown.state === 'failed' ? (
          <div className="flex flex-col gap-3 pt-6 text-sm">
            <p className="font-medium text-stone-900">
              {shown.reason === 'invalid'
                ? t.remote.phoneInvalid
                : shown.reason === 'gone'
                  ? t.remote.phoneGone
                  : shown.reason === 'service'
                    ? t.remote.failedService
                    : t.remote.failed}
            </p>
            {shown.reason === 'ice' && <p className="text-stone-500">{t.remote.failedHint}</p>}
            {shown.reason !== 'invalid' && (
              <div>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setStatus({ state: 'connecting' })
                    setAttempt((n) => n + 1)
                  }}
                >
                  {t.remote.retry}
                </button>
              </div>
            )}
          </div>
        ) : !connected ? (
          <p className="pt-6 text-sm text-stone-400">{t.remote.phoneConnecting}</p>
        ) : !presenting ? (
          <p className="pt-6 text-sm text-stone-500">{t.remote.phoneNotPresenting}</p>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              {state.index >= 0 ? `${state.index + 1} / ${state.total}` : t.remote.beforeStart}
            </p>
            <h1 className="mt-1 font-serif text-2xl leading-tight text-stone-900">{state.stepTitle || state.title}</h1>
            <div className="mt-3 space-y-3 text-base leading-relaxed text-stone-700">
              <Markdownish text={state.narration} />
            </div>
          </>
        )}
      </section>

      {presenting && (
        <footer className="border-t border-stone-200 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <p className="mb-3 truncate text-xs text-stone-500">
            <span className="font-semibold uppercase tracking-wider text-stone-400">{t.remote.nextStep} · </span>
            {state.nextTitle ?? t.remote.lastStep}
          </p>
          <div className="mb-2 flex gap-2">
            <button className="btn flex-1 py-2 text-sm" onClick={() => send('overview')}>
              {t.remote.overview}
            </button>
            <button className="btn flex-1 py-2 text-sm" onClick={() => send('recenter')}>
              {t.remote.recenter}
            </button>
          </div>
          <div className="flex gap-2">
            <button className="btn h-20 flex-1 text-lg" onClick={() => send('previous')} disabled={state.index < 0}>
              ← {t.remote.previous}
            </button>
            <button className="btn-primary h-20 flex-[2] text-lg" onClick={() => send('next')} disabled={state.index >= state.total - 1}>
              {t.remote.next} →
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-stone-400">
            {t.remote.connected} · {shown.state === 'connected' && t.remote.kinds[shown.kind]}
          </p>
        </footer>
      )}
    </main>
  )
}

function Timer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  return <span className="font-mono tabular-nums text-stone-700">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</span>
}

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
