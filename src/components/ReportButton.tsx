'use client'

import { useState } from 'react'
import { useT } from '@/i18n/client'

/** Signalement d'une présentation publiée : un formulaire, envoyé par e-mail à l'exploitant du site. */
export function ReportButton({ shareId }: { shareId: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form)
    setState('sending')
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, reason: data.get('reason'), contact: data.get('contact'), website: data.get('website') }),
    }).catch(() => null)
    setState(res?.ok ? 'sent' : 'failed')
  }

  return (
    <>
      <button
        className="pointer-events-auto absolute right-3 top-3 z-[500] rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-900"
        onClick={() => setOpen(true)}
      >
        {t.viewer.report}
      </button>
      {open && (
        <div className="preset-overlay" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form
            className="preset-dialog share-dialog"
            aria-label={t.viewer.reportTitle}
            onSubmit={(e) => {
              e.preventDefault()
              void submit(e.currentTarget)
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{t.viewer.reportTitle}</h2>
              <button type="button" className="preset-icon" onClick={() => setOpen(false)} aria-label={t.common.close}>
                ✕
              </button>
            </div>
            {state === 'sent' ? (
              <p>{t.viewer.reportSent}</p>
            ) : (
              <>
                <p className="text-zinc-500">{t.viewer.reportIntro}</p>
                <label className="flex flex-col gap-1">
                  <span className="preset-group-title">{t.viewer.reportReason}</span>
                  <textarea name="reason" required minLength={5} maxLength={2000} rows={4} className="preset-input" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="preset-group-title">{t.viewer.reportContact}</span>
                  <input name="contact" type="email" maxLength={200} className="preset-input" />
                </label>
                {/* Piège à robots : invisible et ignoré par un humain. */}
                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                {state === 'failed' && <p className="text-red-600">{t.viewer.reportFailed}</p>}
                <div>
                  <button className="btn-primary" disabled={state === 'sending'}>
                    {t.viewer.reportSend}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  )
}
