import { Fragment, type ReactNode } from 'react'

// Markdown léger de la narration et des notes : paragraphes, citations (>), **gras**, *italique*.
// Sans dépendance à tldraw : aussi utilisé par la page de télécommande (téléphone).

export function Markdownish({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim())
  return (
    <>
      {blocks.map((block, i) =>
        block.startsWith('>') ? (
          <blockquote key={i} className="border-l-4 border-amber-400 pl-4 font-serif italic text-stone-800">
            {inline(block.replace(/^>\s?/gm, ''))}
          </blockquote>
        ) : (
          <p key={i}>{inline(block)}</p>
        )
      )}
    </>
  )
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-stone-900">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}
