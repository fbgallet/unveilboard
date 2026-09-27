'use client'

import { useState } from 'react'
import { useT } from '@/i18n/client'

/** Formulaire de contact de la page /legal : envoyé par e-mail à l'éditeur, dont l'adresse reste cachée. */
export function ContactForm() {
  const t = useT()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form)
    setState('sending')
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: data.get('message'), contact: data.get('contact'), website: data.get('website') }),
    }).catch(() => null)
    setState(res?.ok ? 'sent' : 'failed')
  }

  if (state === 'sent') return <p>{t.legal.sent}</p>
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit(e.currentTarget)
      }}
    >
      <p>{t.legal.contactIntro}</p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.legal.message}</span>
        <textarea name="message" required minLength={5} maxLength={4000} rows={5} className="legal-input" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.legal.contact}</span>
        <input name="contact" type="email" maxLength={200} className="legal-input" />
      </label>
      {/* Piège à robots : invisible et ignoré par un humain. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {state === 'failed' && <p className="text-red-600">{t.legal.failed}</p>}
      <div>
        <button className="btn-primary px-4 py-2" disabled={state === 'sending'}>
          {t.legal.send}
        </button>
      </div>
    </form>
  )
}
