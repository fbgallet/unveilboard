import OpenRouterCallback from './OpenRouterCallback'

// Retour de la connexion à OpenRouter (OAuth PKCE) : le code est échangé contre une clé dans le
// navigateur, qui la garde ; puis retour au schéma.
export default async function Page({ searchParams }: PageProps<'/ai/callback'>) {
  const { code } = await searchParams
  return <OpenRouterCallback code={typeof code === 'string' ? code : null} />
}
