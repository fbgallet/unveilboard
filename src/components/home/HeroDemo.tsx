'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/i18n/client'

// Aperçu animé de la page d'accueil : un petit schéma dévoilé en quatre étapes, en boucle.
// Il imite le principe de l'app (apparaître, atténuer, surligner) sans charger tldraw.

const STEPS = 4
const TICK_MS = 1700
/** Pauses en fin de boucle : le schéma complet reste affiché un moment. */
const HOLD_TICKS = 2

interface Box {
  x: number
  y: number
  label: string
  tone: 'violet' | 'blue' | 'green' | 'amber'
}

const TONES = {
  violet: { stroke: '#7c3aed', fill: '#f5f3ff' },
  blue: { stroke: '#2563eb', fill: '#eff6ff' },
  green: { stroke: '#059669', fill: '#ecfdf5' },
  amber: { stroke: '#d97706', fill: '#fffbeb' },
}

const W = 160
const H = 54

export function HeroDemo() {
  const t = useT()
  const d = t.landing.demo
  const [tick, setTick] = useState(STEPS)

  useEffect(() => {
    // Premier affichage : le schéma complet (aussi rendu côté serveur), puis la boucle démarre.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setTick((n) => (n + 1) % (STEPS + HOLD_TICKS + 1)), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // tick 0 : tout est caché (début de boucle) ; 1 à 4 : étapes ; au-delà : pause sur l'état final.
  const step = Math.min(tick, STEPS)

  const boxes: Record<string, Box & { at: number; dimmed?: boolean; glow?: boolean }> = {
    problem: { x: 180, y: 16, label: d.problem, tone: 'violet', at: 1 },
    first: { x: 25, y: 118, label: d.first, tone: 'blue', at: 2, dimmed: step === 3 },
    second: { x: 335, y: 118, label: d.second, tone: 'green', at: 3 },
    result: { x: 180, y: 220, label: d.result, tone: 'amber', at: 4, glow: step === 4 },
  }
  const arrows = [
    { d: 'M 235 70 C 200 92, 150 96, 112 116', at: 2, dimmed: step === 3 },
    { d: 'M 285 70 C 320 92, 370 96, 408 116', at: 3 },
    { d: 'M 105 172 C 115 200, 190 206, 232 218', at: 4 },
    { d: 'M 415 172 C 405 200, 330 206, 288 218', at: 4 },
  ]

  return (
    <figure className="hero-demo" aria-label={t.landing.demoLabel}>
      <div className="hero-demo-bar" aria-hidden="true">
        <span className="hero-demo-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="hero-demo-progress">
          {Array.from({ length: STEPS }, (_, i) => (
            <i key={i} className={i < step ? 'on' : ''} />
          ))}
        </span>
      </div>

      <div className="hero-demo-body" aria-hidden="true">
        <svg viewBox="0 0 520 290" className="hero-demo-canvas">
          <defs>
            <marker id="hero-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#57534e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <filter id="hero-glow" x="-30%" y="-60%" width="160%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#f59e0b" floodOpacity="0.55" />
            </filter>
          </defs>

          {arrows.map((a, i) => (
            <path
              key={i}
              d={a.d}
              pathLength={1}
              className={`hero-arrow ${step >= a.at ? 'shown' : ''} ${a.dimmed ? 'dimmed' : ''}`}
              markerEnd="url(#hero-arrow)"
            />
          ))}

          {Object.entries(boxes).map(([key, b]) => {
            const tone = TONES[b.tone]
            return (
              <g
                key={key}
                className={`hero-box ${step >= b.at ? 'shown' : ''} ${b.dimmed ? 'dimmed' : ''}`}
                filter={b.glow ? 'url(#hero-glow)' : undefined}
              >
                <rect x={b.x} y={b.y} width={W} height={H} rx={10} fill={tone.fill} stroke={tone.stroke} strokeWidth={2} />
                <text x={b.x + W / 2} y={b.y + H / 2} textAnchor="middle" dominantBaseline="central">
                  {b.label}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="hero-demo-narration">
          <p className="hero-demo-step">{d.step(Math.max(step, 1), STEPS)}</p>
          {/* key : relance l'animation d'entrée du texte à chaque étape */}
          <p key={step} className="hero-demo-caption">
            {d.captions[Math.max(step, 1) - 1]}
          </p>
          <span className="hero-demo-line" />
          <span className="hero-demo-line short" />
        </div>
      </div>
    </figure>
  )
}
