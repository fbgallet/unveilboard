'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { atom, useValue, type Editor } from 'tldraw'
import { useT } from '@/i18n/client'
import { readSequence } from '@/lib/canvas/adapter'
import { buildHandout, releaseHandout, type HandoutStep } from '@/lib/canvas/handout'
import { Markdownish } from './Markdownish'

export const handoutOpenAtom = atom<boolean>('handoutOpen', false)

/**
 * Polycopié à distribuer : chaque étape (image du schéma à ce stade, narration), à imprimer ou à
 * enregistrer en PDF par la boîte d'impression du navigateur. Rendu dans <body> : à l'impression,
 * tout le reste de l'app est masqué (globals.css, @media print).
 */
export function Handout({ editor }: { editor: Editor }) {
  const open = useValue(handoutOpenAtom)
  if (!open) return null
  return createPortal(<HandoutView editor={editor} />, document.body)
}

function HandoutView({ editor }: { editor: Editor }) {
  const t = useT()
  const seq = readSequence(editor)
  const [steps, setSteps] = useState<HandoutStep[] | null>(null)

  useEffect(() => {
    if (!seq) return
    let built: HandoutStep[] = []
    let cancelled = false
    void buildHandout(editor, seq).then((s) => {
      built = s
      if (!cancelled) setSteps(s)
      else releaseHandout(s)
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handoutOpenAtom.set(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelled = true
      releaseHandout(built)
      window.removeEventListener('keydown', onKey)
    }
    // Instantané du document à l'ouverture : on ne reconstruit pas à chaque modification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <div className="handout-root">
      <div className="handout-toolbar">
        <span>{t.handout.hint}</span>
        <button className="btn-primary" disabled={!steps} onClick={() => window.print()}>
          {t.handout.print}
        </button>
        <button className="btn" onClick={() => handoutOpenAtom.set(false)}>
          {t.handout.close}
        </button>
      </div>
      <article className="handout">
        <h1>{seq?.title}</h1>
        {!steps ? (
          <p className="handout-wait">{t.handout.preparing}</p>
        ) : (
          steps.map((s) => (
            <section key={s.number} className="handout-step">
              <h2>
                <span>{t.handout.step(s.number)}</span> {s.title}
              </h2>
              {s.width > 0 && (
                <div className="handout-figure" style={{ aspectRatio: `${s.width} / ${s.height}`, maxWidth: s.width }}>
                  {/* Images locales (blob:) : next/image ne s'applique pas. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.dimmed && <img src={s.dimmed} alt="" className="handout-dimmed" />}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.active && <img src={s.active} alt="" />}
                </div>
              )}
              {s.narration.trim() && (
                <div className="handout-text">
                  <Markdownish text={s.narration} />
                </div>
              )}
            </section>
          ))
        )}
      </article>
    </div>
  )
}
