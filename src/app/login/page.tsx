import { redirect } from 'next/navigation'
import { storageMode } from '@/lib/storageMode'
import { LoginForm } from './LoginForm'
import { getMessages } from '@/i18n/server'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Mode local : pas de connexion.
  if (storageMode() === 'local') redirect('/')
  const { next } = await searchParams
  const t = await getMessages()
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fbfaf7] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-3xl text-stone-900">Unveilboard</h1>
          <LocaleSwitcher />
        </div>
        <p className="mt-2 text-sm text-stone-500">{t.login.subtitle}</p>
        <LoginForm next={typeof next === 'string' ? next : '/'} />
      </div>
    </main>
  )
}
