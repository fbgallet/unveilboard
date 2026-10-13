'use client'

import { useT } from '@/i18n/client'
import type { Messages } from '@/i18n/config'
import type { Citation } from '@/lib/ai/chat'
import type { ProviderKind } from '@/lib/ai/client'

/** Pourquoi la recherche sur le web n'est pas possible avec ce fournisseur. */
export const webUnavailableText = (kind: ProviderKind, t: Messages) => (kind === 'server' ? t.web.unavailableServer : t.web.unavailable)

/**
 * Bouton globe : chercher sur le web pour cette demande. `required` : la demande (une visée) s'appuie
 * sur le web, le bouton reste enfoncé ; `clipboard` : c'est l'assistant où l'on colle la consigne
 * qui cherche ; `unavailable` : impossible avec ce fournisseur (la raison), le bouton est grisé.
 */
export function WebToggle({
  on,
  onChange,
  required = false,
  clipboard = false,
  unavailable,
  className = 'btn-xs',
  onClass = 'btn-xs-on',
}: {
  on: boolean
  onChange(on: boolean): void
  required?: boolean
  clipboard?: boolean
  unavailable?: string
  className?: string
  onClass?: string
}) {
  const t = useT()
  const pressed = !unavailable && (on || required)
  return (
    <button
      type="button"
      className={`${className} inline-flex items-center gap-1 ${pressed ? onClass : ''} ${unavailable ? 'opacity-50' : ''}`}
      aria-pressed={pressed}
      disabled={required || !!unavailable}
      title={unavailable ?? (required ? t.web.required : clipboard ? t.web.clipboardHint : t.web.hint)}
      onClick={() => onChange(!on)}
    >
      <GlobeIcon />
      {t.web.label}
    </button>
  )
}

export function GlobeIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M1.75 8h12.5M8 1.75c-1.9 1.8-2.75 3.9-2.75 6.25S6.1 12.45 8 14.25M8 1.75c1.9 1.8 2.75 3.9 2.75 6.25S9.9 12.45 8 14.25" />
    </svg>
  )
}

/** Nom du site d'une adresse (sans « www. »). */
export const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Pages consultées par l'IA : leur titre (sinon l'adresse) et leur site, en liens. */
export function Citations({ citations, className = '' }: { citations: Citation[]; className?: string }) {
  const t = useT()
  return (
    <ul className={`citations ${className}`} aria-label={t.web.sourcesHint}>
      {citations.map((c) => (
        <li key={c.url}>
          <a href={c.url} target="_blank" rel="noopener noreferrer" title={c.url}>
            {c.title || c.url}
          </a>
          <span className="citations-site">{siteOf(c.url)}</span>
        </li>
      ))}
    </ul>
  )
}
