import { redirect } from 'next/navigation'
import { storageMode } from '@/lib/storageMode'
import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Mode local : pas de connexion.
  if (storageMode() === 'local') redirect('/')
  const { next } = await searchParams
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fbfaf7] px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-stone-900">Unveilboard</h1>
        <p className="mt-2 text-sm text-stone-500">Accès personnel.</p>
        <LoginForm next={typeof next === 'string' ? next : '/'} />
      </div>
    </main>
  )
}
