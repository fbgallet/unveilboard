'use client'

import { useState } from 'react'
import { useLocale, useT } from '@/i18n/client'
import { AUTO_LANG, CONTENT_LANGS, UI_LANG, isLangCode, languageName } from '@/lib/ai/language'

const OTHER = '__other'

/**
 * Langue du contenu écrit par l'IA : automatique, celle de l'interface, une langue de la liste ou
 * un code saisi. Dans les réglages de l'IA (valeur par défaut) et, repliée, dans les fenêtres de création.
 */
export function ContentLangSelect({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled?: boolean }) {
  const t = useT()
  const [locale] = useLocale()
  const listed = value === AUTO_LANG || value === UI_LANG || (CONTENT_LANGS as readonly string[]).includes(value)
  const [other, setOther] = useState(!listed)
  const [code, setCode] = useState(listed ? '' : value)
  const name = (code: string) => languageName(code, locale)
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        className="preset-input"
        value={other ? OTHER : value}
        disabled={disabled}
        aria-label={t.ai.lang.label}
        onChange={(e) => {
          if (e.target.value === OTHER) return setOther(true)
          setOther(false)
          onChange(e.target.value)
        }}
      >
        <option value={AUTO_LANG}>{t.ai.lang.auto}</option>
        <option value={UI_LANG}>{t.ai.lang.ui(name(locale))}</option>
        <optgroup label={t.ai.lang.label}>
          {CONTENT_LANGS.map((c) => (
            <option key={c} value={c}>
              {name(c)}
            </option>
          ))}
        </optgroup>
        <option value={OTHER}>{t.ai.lang.other}</option>
      </select>
      {other && (
        <input
          className="preset-input diagram-size-input"
          value={code}
          disabled={disabled}
          placeholder={t.ai.lang.otherPlaceholder}
          aria-label={t.ai.lang.otherLabel}
          onChange={(e) => {
            const next = e.target.value.trim()
            setCode(next)
            if (isLangCode(next)) onChange(next)
          }}
        />
      )}
    </span>
  )
}

/** « automatique », « allemand »… */
export function useLangSummary() {
  const t = useT()
  const [locale] = useLocale()
  return (value: string) => (value === AUTO_LANG ? t.ai.lang.autoShort : languageName(value === UI_LANG ? locale : value, locale))
}

/**
 * Rappel discret dans une fenêtre de création : la langue réglée (par défaut, celle des réglages de
 * l'IA), modifiable pour cette création seulement.
 */
export function ContentLangNote({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled?: boolean }) {
  const t = useT()
  const summary = useLangSummary()
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-1 text-xs text-zinc-500">
      <span className="flex flex-wrap items-center gap-1">
        {t.ai.lang.note(summary(value))}
        <button className="underline" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t.ai.size.done : t.ai.size.change}
        </button>
      </span>
      {open && (
        <>
          <ContentLangSelect value={value} onChange={onChange} disabled={disabled} />
          <span>{t.ai.lang.thisTime}</span>
        </>
      )}
    </div>
  )
}
