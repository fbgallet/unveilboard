import { useMemo } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import type { Options as MarkdownOptions } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

// Markdown de la narration et des notes : titres, listes, liens, tableaux, citations,
// images… (GFM). Un simple retour à la ligne en est un. Pas de HTML brut (partage public).
// Tailles en em : elles suivent le réglage de taille du texte du panneau.
// Sans dépendance à tldraw : aussi utilisé par la vue écran et la page de télécommande.

const baseComponents: Components = {
  h1: ({ children }) => <h3 className="font-serif text-[1.5em] leading-tight text-stone-900">{children}</h3>,
  h2: ({ children }) => <h4 className="font-serif text-[1.3em] leading-tight text-stone-900">{children}</h4>,
  h3: ({ children }) => <h5 className="text-[1.1em] font-semibold text-stone-900">{children}</h5>,
  strong: ({ children }) => <strong className="font-semibold text-stone-900">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-amber-400 pl-4 font-serif italic text-stone-800">{children}</blockquote>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-[0.3em] pl-[1.3em]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-[0.3em] pl-[1.5em]">{children}</ol>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline decoration-amber-300 underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-stone-100 px-[0.3em] font-mono text-[0.85em]">{children}</code>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-md bg-stone-100 p-[0.8em] text-[0.85em]">{children}</pre>,
  table: ({ children }) => <table className="w-full border-collapse text-[0.9em]">{children}</table>,
  th: ({ children }) => <th className="border-b-2 border-stone-300 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-stone-200 px-2 py-1 align-top">{children}</td>,
  hr: () => <hr className="border-stone-200" />,
}

/**
 * Images : adresses web, références aux ressources du document (« asset:… », résolues par
 * resolveSrc) et images intégrées (data URL), en plus des adresses admises par défaut.
 */
function urlTransform(url: string, key: string) {
  if (key === 'src' && (url.startsWith('asset:') || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(url))) return url
  return defaultUrlTransform(url)
}

/**
 * resolveSrc : adresse affichable d'une image (ressources du document tldraw). `remarkPlugins` et
 * `components` : transformations (avant les retours à la ligne) et rendus en plus (ex. : passages
 * surlignés du texte source).
 */
export function Markdownish({
  text,
  resolveSrc,
  remarkPlugins,
  components: extra,
}: {
  text: string
  resolveSrc?: (src: string) => string | undefined
  remarkPlugins?: NonNullable<MarkdownOptions['remarkPlugins']>
  components?: Components
}) {
  const components = useMemo<Components>(
    () => ({
      ...baseComponents,
      img: ({ src, alt }) => {
        const url = typeof src === 'string' ? (resolveSrc ? resolveSrc(src) : src) : undefined
        // eslint-disable-next-line @next/next/no-img-element -- adresses quelconques, pas d'optimisation Next
        return url ? <img src={url} alt={alt ?? ''} className="max-h-[60vh] max-w-full rounded-md" /> : <span className="italic text-stone-400">[{alt}]</span>
      },
      ...extra,
    }),
    [resolveSrc, extra]
  )
  return (
    <Markdown remarkPlugins={[remarkGfm, ...(remarkPlugins ?? []), remarkBreaks]} components={components} urlTransform={urlTransform}>
      {text}
    </Markdown>
  )
}
