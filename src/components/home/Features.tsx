'use client'

import { useT } from '@/i18n/client'

// Icônes au trait, dans l'ordre des atouts (voir t.landing.features).
const ICONS = [
  // Dévoiler pas à pas : trois blocs, le dernier en pointillés
  <>
    <rect x="3" y="4" width="7" height="6" rx="1.5" />
    <rect x="14" y="4" width="7" height="6" rx="1.5" />
    <rect x="8.5" y="14" width="7" height="6" rx="1.5" strokeDasharray="2 2" />
  </>,
  // Narration : lignes de texte
  <>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <path d="M7 8h10M7 12h10M7 16h6" />
  </>,
  // Présenter : écran et pointeur
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M12 16v4M8 20h8" />
    <circle cx="15" cy="9" r="1.6" fill="currentColor" />
  </>,
  // Carte d'argument : une thèse et deux branches
  <>
    <rect x="8" y="3" width="8" height="5" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
    <rect x="14" y="16" width="7" height="5" rx="1.5" />
    <path d="M12 8v4M6.5 16v-4h11v4" />
  </>,
  // Éditeur : crayon
  <>
    <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
    <path d="M14 7l3 3" />
  </>,
]

export function Features() {
  const t = useT()
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
      {t.landing.features.map((f, i) => (
        <li key={f.title}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[i]}
            </svg>
          </span>
          <h3 className="mt-3 font-medium text-stone-900">{f.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{f.text}</p>
        </li>
      ))}
    </ul>
  )
}
