import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { storageMode } from '@/lib/storageMode'

export async function proxy(request: NextRequest) {
  // Mode local : pas de serveur de données, donc rien à protéger.
  if (storageMode() === 'local') return NextResponse.next()
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (ok) return NextResponse.next()

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const login = new URL('/login', request.url)
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(login)
}

export const config = {
  // Tout sauf : la connexion, les présentations partagées (/p, /p/<id>) et leur signalement, les icônes et l'image
  // d'aperçu (lues par les navigateurs et les réseaux sociaux sans session), les fichiers statiques.
  matcher: ['/((?!login|p$|p/|api/report|icon\\.svg|apple-icon|opengraph-image|_next/static|_next/image|favicon.ico).*)'],
}
