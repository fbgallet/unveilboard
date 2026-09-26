import 'server-only'
import { cookies, headers } from 'next/headers'
import { LOCALE_COOKIE, isLocale, matchLocale, messagesFor, parseAcceptLanguage, type Locale } from './config'

/** Langue de la requête : choix enregistré (cookie), sinon langue du navigateur. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(saved)) return saved
  return matchLocale(parseAcceptLanguage((await headers()).get('accept-language')))
}

export async function getMessages() {
  return messagesFor(await getLocale())
}
