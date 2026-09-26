'use client'

import { useEffect, useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { useT } from '@/i18n/client'
import { readSequence } from '@/lib/canvas/adapter'
import { presentationStartedAtAtom, stepIndexAtom } from '@/lib/presentation/store'
import { screenConnectedAtom, screenNarrationAtom } from '@/lib/presentation/screen'

/**
 * Vue présentateur (double affichage) : en tête du panneau de narration, tant qu'une fenêtre public
 * est ouverte. Chronomètre, étape suivante, et narration projetée ou non.
 */
export function ScreenControls({ editor }: { editor: Editor }) {
  const t = useT()
  const connected = useValue(screenConnectedAtom)
  const narration = useValue(screenNarrationAtom)
  const index = useValue(stepIndexAtom)
  const next = useValue('next step', () => readSequence(editor)?.steps[index + 1] ?? null, [editor, index])
  if (!connected) return null

  return (
    <div className="screen-controls mb-6 flex flex-col gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {t.screen.connected}
        </span>
        <Timer />
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={narration} onChange={(e) => screenNarrationAtom.set(e.target.checked)} />
        {t.screen.narrationOnScreen}
      </label>
      <p className="truncate">
        <span className="font-semibold uppercase tracking-wider text-stone-400">{t.screen.next} · </span>
        <span className="text-stone-700">{next ? next.title : t.screen.lastStep}</span>
      </p>
    </div>
  )
}

function Timer() {
  const t = useT()
  const startedAt = useValue(presentationStartedAtAtom)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <button
      className="font-mono tabular-nums text-stone-700 hover:text-stone-900"
      title={t.screen.timerHint}
      onClick={() => {
        presentationStartedAtAtom.set(Date.now())
        setNow(Date.now())
      }}
    >
      {text}
    </button>
  )
}
