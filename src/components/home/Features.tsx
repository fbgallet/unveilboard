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
  // Partir d'un texte : une page, et une boîte qui en sort
  <>
    <path d="M4 3h8l3 3v8H4z" />
    <path d="M7 8h5M7 11h3" />
    <rect x="14" y="15" width="7" height="6" rx="1.5" />
    <path d="M12 14l3 2" />
  </>,
  // IA : deux étincelles
  <>
    <path d="M10 3.5l1.8 5.2 5.2 1.8-5.2 1.8L10 17.5l-1.8-5.2L3 10.5l5.2-1.8z" />
    <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </>,
]

export function Features() {
  const t = useT()
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
