'use client'

import { useValue } from 'tldraw'
import { useT } from '@/i18n/client'
import { shortcutsHelpOpenAtom } from '@/lib/presentation/store'

/** Aide des raccourcis de présentation (touche ?, ou menu ⋯). Échap la ferme (usePresentation). */
export function ShortcutsHelp() {
  const t = useT()
  const h = t.help
  const open = useValue(shortcutsHelpOpenAtom)
  if (!open) return null
  const close = () => shortcutsHelpOpenAtom.set(false)

  const groups: { title: string; rows: [keys: string[], label: string][] }[] = [
    {
      title: h.navigation,
      rows: [
        [['→', t.panel.shortcuts.space, 'PageDown'], h.next],
        [['←', 'PageUp'], h.previous],
        [['Home', 'End'], h.firstLast],
      ],
    },
    {
      title: h.display,
      rows: [
        [['O'], h.overview],
        [['C'], h.recenter],
        [['F'], h.fullscreen],
        [['N'], h.narration],
        [['Tab'], h.tabs],
        [['+', '−', '0'], h.textSize],
        [[h.wheel], h.textSizeWheel],
        [['L'], h.legend],
        [['V'], h.view],
        [['1', '…', '9'], h.foldLevel],
      ],
    },
    {
      title: h.tools,
      rows: [
        [['K'], h.laser],
        [['M'], h.mask],
        [[h.click], h.jump],
        [[h.doubleClick], h.note],
      ],
    },
    {
      title: h.other,
      rows: [
        [['Esc'], h.escape],
        [['?'], h.help],
      ],
    },
  ]

  return (
    <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="preset-dialog shortcuts-help" role="dialog" aria-label={h.title}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{h.title}</h2>
          <button className="preset-icon" onClick={close} aria-label={h.close} title={h.close}>
            ✕
          </button>
        </div>
        <div className="shortcuts-grid">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="preset-group-title">{g.title}</h3>
              <dl>
                {g.rows.map(([keys, label]) => (
                  <div key={label} className="shortcuts-row">
                    <dt>
                      {keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </dt>
                    <dd>{label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{h.remoteHint}</p>
      </div>
    </div>
  )
}
