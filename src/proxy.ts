import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { storageMode } from '@/lib/storageMode'

// Accessible sans session : la connexion, les mentions légales et leur formulaire de contact, les présentations partagées (/p, /p/<id>) et leur signalement, la page
// de télécommande (/r, sans donnée : tout passe en direct entre les appareils), les icônes et l'image
// d'aperçu (lues par les navigateurs et les réseaux sociaux sans session), et la mesure d'audience
// de Vercel (/_vercel/insights : script et envoi des visites, sans session sur /login).
const PUBLIC = /^\/(login|legal|p$|p\/|r$|api\/report|api\/contact|icon\.svg|apple-icon|opengraph-image|_vercel|favicon\.ico)/

/**
 * Politique de sécurité du contenu. L'essentiel : seuls les scripts de Next (marqués du nonce de la
 * requête) et ceux qu'ils chargent s'exécutent, pour qu'une injection ne puisse pas lire les clés d'IA
 * rangées dans le navigateur. Les connexions restent ouvertes : le fournisseur d'IA « personnalisé »
 * est une adresse quelconque (Ollama, LM Studio…), et la télécommande passe par PeerJS.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // En développement, React se sert d'eval pour ses piles d'erreurs.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // tldraw et React posent des styles en ligne.
    "style-src 'self' 'unsafe-inline'",
    // Images d'un schéma : n'importe quelle adresse (Wikimédia…), ou collées (data:, blob:).
    "img-src * data: blob:",
    "media-src * data: blob:",
    // Polices, icônes et traductions de tldraw.
    "font-src 'self' data: https://cdn.tldraw.com",
    'connect-src * data: blob: ws: wss:',
    // Lecture des PDF (pdf.js).
    "worker-src 'self' blob:",
    // Intégrations de tldraw (YouTube, Figma…).
    'frame-src https:',
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (storageMode() === 'cloud' && !PUBLIC.test(pathname) && !(await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const login = new URL('/login', request.url)
    login.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(login)
  }
  if (pathname.startsWith('/api/')) return NextResponse.next()

  // Next lit le nonce dans l'en-tête de la requête et l'ajoute à ses propres scripts.
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  // Tout sauf les fichiers statiques de Next.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
