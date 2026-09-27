import 'server-only'

// Messages à l'exploitant de l'instance (signalement d'un partage, formulaire de contact) : un e-mail
// à REPORT_EMAIL, via l'API de Resend (RESEND_API_KEY). L'adresse ne quitte jamais le serveur.
// Sans domaine vérifié chez Resend, l'expéditeur de test (onboarding@resend.dev) ne peut écrire
// qu'à l'adresse du compte Resend : il suffit que ce soit REPORT_EMAIL.

export function ownerMailEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.REPORT_EMAIL) || process.env.NODE_ENV === 'development'
}

export async function sendToOwner(subject: string, text: string, replyTo?: string) {
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_EMAIL) {
    // Développement sans Resend : le message s'affiche dans la console du serveur.
    console.info(`[message] ${subject}\n${text}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || 'Unveilboard <onboarding@resend.dev>',
      to: [process.env.REPORT_EMAIL],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}`)
}

/** Compte un message de cette adresse IP (hachée) pour la journée ; false au-delà de la limite. */
export async function allowMessage(request: Request, kind: string, perDay: number) {
  const { createHash } = await import('node:crypto')
  const { kv } = await import('./kv')
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const who = createHash('sha256').update(ip).digest('hex').slice(0, 32)
  const day = Math.floor(Date.now() / 86_400_000)
  return (await kv().incr(`rl:${kind}:${who}:d${day}`, 86_400)) <= perDay
}
