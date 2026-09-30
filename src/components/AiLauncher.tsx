'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { useT } from '@/i18n/client'
import { reviewAtom, reviewOpenAtom } from '@/lib/canvas/review'
import { modeAtom } from '@/lib/presentation/store'
import { aiSettingsOpenAtom } from './AiSettingsDialog'
import { elementAiAtom } from './ElementAi'
import { planPanelOpenAtom } from './PlanPanel'
import { readPlanRecord } from '@/lib/canvas/plan'
import { readPageSource } from '@/lib/canvas/source'
import { setSourcePanelOpen, sourcePanelOpenAtom } from './SourcePanel'
import { mapImportOpenAtom, openAssistant } from './MapJsonDialog'
import { sourceDialogOpenAtom } from './SourceDialog'

type IconName = 'branch' | 'wand' | 'steps' | 'review' | 'document' | 'braces' | 'gear' | 'plan'

interface Item {
  id: string
  icon: IconName
  label: string
  action: () => void
  disabled?: boolean
  hint?: string
}

/** Icônes au trait (16 px), dans la couleur du texte. */
const ICONS: Record<IconName, React.ReactNode> = {
  // Une boîte d'où partent deux branches.
  branch: (
    <>
      <rect x="2" y="9" width="6" height="6" rx="1" />
      <path d="M8 12h3m0-5v10m0-10h2m-2 10h2" />
      <rect x="15" y="4" width="7" height="6" rx="1" />
      <rect x="15" y="14" width="7" height="6" rx="1" />
    </>
  ),
  // Baguette : créer ou modifier.
  wand: (
    <>
      <path d="M4 20 15 9" />
      <path d="M15 4v2m0 6v2m-5-5h2m6 0h2m-8.5-3.5 1.4 1.4m5.2 5.2 1.4 1.4m0-8-1.4 1.4" />
    </>
  ),
  // Étapes numérotées.
  steps: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 5.5 5 5v3M3.8 11.2c.3-.6 1.9-.7 1.9.3 0 .8-1.9 1.5-1.9 2.5h2M3.8 16.5h1.9L4.8 18c.8 0 1.2.4 1.2.9s-.5 1-1.2 1-1-.3-1.1-.6" />
    </>
  ),
  // Loupe et coche : relire.
  review: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5M7.5 10.5l2 2 3.5-4" />
    </>
  ),
  // Page de texte.
  document: (
    <>
      <path d="M6 2.5h8l4 4V21.5H6z" />
      <path d="M14 2.5v4h4M9 11h6M9 14.5h6M9 18h4" />
    </>
  ),
  braces: <path d="M9 4c-2 0-2.5 1-2.5 3v2c0 1.5-.8 2.5-2.5 3 1.7.5 2.5 1.5 2.5 3v2c0 2 .5 3 2.5 3M15 4c2 0 2.5 1 2.5 3v2c0 1.5.8 2.5 2.5 3-1.7.5-2.5 1.5-2.5 3v2c0 2-.5 3-2.5 3" />,
  plan: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3M5.3 5.3l2.1 2.1m9.2 9.2 2.1 2.1m0-13.4-2.1 2.1m-9.2 9.2-2.1 2.1" />
    </>
  ),
}

function MenuIcon({ name }: { name: IconName }) {
  return (
    <svg className="ai-launcher-item-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  )
}

/**
 * Accès permanent à l'IA, en haut à droite du canevas (en édition) : une icône discrète qui ouvre
 * un menu en trois groupes : ce schéma (développer l'élément sélectionné, créer ou modifier,
 * séquence, relecture critique), un nouveau schéma (depuis un texte, JSON), les réglages.
 * Le menu ☰ garde les mêmes entrées.
 */
export function AiLauncher() {
  const t = useT()
  const editor = useEditor()
  const mode = useValue(modeAtom)
  const reviewOpen = useValue(reviewOpenAtom)
  const remarks = useValue('pending remarks', () => reviewAtom.get().remarks.length, [])
  const selected = useValue(
    'ai selection',
    () => {
      const shape = editor.getOnlySelectedShape()
      return shape?.type === 'geo' ? shape.id : null
    },
    [editor]
  )
  const hasPlan = useValue('has plan', () => !!readPlanRecord(editor), [editor])
  const hasSource = useValue('has source', () => !!readPageSource(editor), [editor])
  const sourceOpen = useValue(sourcePanelOpenAtom)
  const dark = useValue('dark mode', () => editor.user.getIsDarkMode(), [editor])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (mode !== 'edit') return null
  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  // Trois groupes : ce schéma ; un nouveau schéma ; les réglages.
  const groups: Item[][] = [
    [
      {
        id: 'element',
        icon: 'branch',
        label: t.launcher.fromSelection,
        action: () => selected && elementAiAtom.set(selected as TLShapeId),
        disabled: !selected,
        hint: selected ? undefined : t.launcher.selectFirst,
      },
      { id: 'assistant', icon: 'wand', label: t.launcher.assistant, action: () => openAssistant() },
      { id: 'sequence', icon: 'steps', label: t.launcher.sequence, action: () => openAssistant('sequence') },
      {
        id: 'review',
        icon: 'review',
        label: remarks ? t.launcher.reviewCount(remarks) : t.review.menu,
        action: () => {
          planPanelOpenAtom.set(false)
          reviewOpenAtom.set(!reviewOpen)
        },
      },
      {
        id: 'plan',
        icon: 'plan',
        label: hasPlan ? t.plan.menu : t.plan.menuNew,
        action: () => {
          reviewOpenAtom.set(false)
          planPanelOpenAtom.set(true)
        },
      },
    ],
    [
      { id: 'source', icon: 'document', label: t.source.menu, action: () => sourceDialogOpenAtom.set(true) },
      { id: 'json', icon: 'braces', label: t.mapJson.menuImport, action: () => mapImportOpenAtom.set(true) },
    ],
    [{ id: 'settings', icon: 'gear', label: t.ai.settingsMenu, action: () => aiSettingsOpenAtom.set(true) }],
  ]

  return (
    // Nos infobulles (Tooltips.tsx), bien que dans une zone de tldraw.
    <div className="ai-launcher" ref={ref} data-app-tips>
      {/* Mode sombre de tldraw (les panneaux de l'app le suivent). */}
      <button
        className="ai-launcher-icon"
        aria-label={dark ? t.launcher.lightMode : t.launcher.darkMode}
        title={dark ? t.launcher.lightMode : t.launcher.darkMode}
        onClick={() => editor.user.updateUserPreferences({ colorScheme: dark ? 'light' : 'dark' })}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {dark ? (
            // Soleil : revenir au mode clair
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
            </>
          ) : (
            // Lune : passer au mode sombre
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          )}
        </svg>
      </button>
      {/* Texte source de la page : l'afficher à gauche (ou en associer un). */}
      <button
        className={`ai-launcher-icon ${sourceOpen ? 'ai-launcher-icon-on' : ''} ${hasSource ? '' : 'ai-launcher-icon-quiet'}`}
        aria-pressed={sourceOpen}
        aria-label={t.source.toggle}
        title={t.source.toggle}
        onClick={() => setSourcePanelOpen(!sourceOpen)}
      >
        <MenuIcon name="document" />
      </button>
      <button
        className={`ai-launcher-icon ${open ? 'ai-launcher-icon-on' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.launcher.menuLabel}
        title={t.launcher.menuLabel}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" fill="currentColor" />
          <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" />
        </svg>
        {/* Remarques de relecture en attente : un point (le nombre est dans le menu). */}
        {remarks > 0 && <span className="ai-launcher-dot" />}
      </button>
      {open && (
        <div className="ai-launcher-menu" role="menu" aria-label={t.launcher.menuLabel}>
          {groups.map((group, g) => (
            <div key={g} className="ai-launcher-group" role="group">
              {group.map((item) => (
                <button key={item.id} role="menuitem" disabled={item.disabled} title={item.hint} onClick={run(item.action)}>
                  <MenuIcon name={item.icon} />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
