import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMessages } from '@/i18n/server'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { Logo } from '@/components/Logo'
import { Markdownish } from '@/components/Markdownish'
import { ContactForm } from '@/components/ContactForm'
import { legalInfo } from '@/lib/legal'
import { ownerMailEnabled } from '@/lib/server/report'

const GITHUB_URL = 'https://github.com/fbgallet/unveilboard'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages()
  return { title: `${t.legal.title} · Unveilboard` }
}

/** Mentions légales, confidentialité et contact de l'instance (LEGAL_PUBLISHER, voir src/lib/legal.ts). */
export default async function LegalPage() {
  const info = legalInfo()
  if (!info) notFound()
  const t = await getMessages()
  const l = t.legal

  return (
    <main className="site min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label={l.back}>
          <Logo />
        </Link>
        <LocaleSwitcher />
      </header>
      <article className="legal mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        <h1 className="font-serif text-3xl text-stone-900 sm:text-4xl">{l.title}</h1>

        <h2>{l.publisherTitle}</h2>
        <p>{l.publisher(info.publisher)}</p>
        {info.links.length > 0 && (
          <ul className="legal-links">
            {info.links.map((href) => (
              <li key={href}>
                <a href={href} rel="me noreferrer">
                  {href.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
                </a>
              </li>
            ))}
          </ul>
        )}

        <h2>{l.hostTitle}</h2>
        <p>{info.host ?? l.host}</p>

        <h2>{l.privacyTitle}</h2>
        <p>{l.privacyIntro}</p>
        <ul className="legal-list">
          {l.privacy.map((item, i) => (
            <li key={i}>
              <Markdownish text={item} />
            </li>
          ))}
        </ul>
        <p>{l.rights}</p>

        <h2>{l.contentTitle}</h2>
        <p>{l.content}</p>

        <h2>{l.codeTitle}</h2>
        <p>
          {l.code} <a href={GITHUB_URL}>github.com/fbgallet/unveilboard</a>
        </p>
        <p>{l.tldraw}</p>

        <h2 id="contact">{l.contactTitle}</h2>
        {ownerMailEnabled() ? <ContactForm /> : <p>{l.unavailable}</p>}
      </article>
    </main>
  )
}
