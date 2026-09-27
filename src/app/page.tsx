import { redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/session'
import { storageMode } from '@/lib/storageMode'
import { legalInfo } from '@/lib/legal'
import { Home } from './Home'

export default async function HomePage() {
  const storage = storageMode()
  // Mode cloud : lecture du cookie (rend aussi la page dynamique, jamais prérendue au build).
  if (storage === 'cloud' && !(await isAuthenticated())) redirect('/login')
  return <Home storage={storage} legal={!!legalInfo()} />
}
