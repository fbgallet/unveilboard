import 'server-only'

// Signalement d'un partage : un formulaire du lecteur envoie un e-mail à l'exploitant de l'instance
// (REPORT_EMAIL), via l'API de Resend (RESEND_API_KEY). L'adresse ne quitte jamais le serveur.
// Sans domaine vérifié chez Resend, l'expéditeur de test (onboarding@resend.dev) ne peut écrire
// qu'à l'adresse du compte Resend : il suffit que ce soit REPORT_EMAIL.

export function reportEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.REPORT_EMAIL) || process.env.NODE_ENV === 'development'
}

export async function sendReport(subject: string, text: string, replyTo?: string) {
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_EMAIL) {
    // Développement sans Resend : le signalement s'affiche dans la console du serveur.
    console.info(`[report] ${subject}\n${text}`)
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
