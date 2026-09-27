'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/client'
import { finishOpenRouterLogin } from '@/lib/ai/client'
import { toAiError } from '@/lib/ai/errors'

export default function OpenRouterCallback({ code }: { code: string | null }) {
  const t = useT()
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    finishOpenRouterLogin(code)
      .then((returnTo) => location.replace(returnTo))
      .catch((e) => {
        const error = toAiError(e)
        setFailure(error.detail ?? t.ai.errors[error.kind])
      })
  }, [code, t])

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center text-sm text-zinc-600">
      {!code ? <p>{t.ai.callback.noCode}</p> : failure ? <p className="text-red-700">{t.ai.callback.failed(failure)}</p> : <p>{t.ai.callback.connecting}</p>}
      {(failure || !code) && (
        <Link className="underline" href="/">
          {t.ai.callback.home}
        </Link>
      )}
    </main>
  )
}
