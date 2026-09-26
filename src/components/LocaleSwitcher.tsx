'use client'

import { LOCALES, LOCALE_NAMES } from '@/i18n/config'
import { useLocale, useT } from '@/i18n/client'

/** Sélecteur de langue discret : « EN · FR ». */
export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const [locale, setLocale] = useLocale()
  const t = useT()
  return (
    <div className={`flex items-center gap-0.5 text-xs ${className}`} role="group" aria-label={t.common.language}>
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-stone-300" aria-hidden="true">·</span>}
          <button
            className={`rounded px-1 uppercase ${l === locale ? 'font-semibold text-stone-900' : 'text-stone-400 hover:text-stone-900'}`}
            onClick={() => setLocale(l)}
            aria-pressed={l === locale}
            title={LOCALE_NAMES[l]}
            lang={l}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  )
}
