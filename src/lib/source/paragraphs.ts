// Paragraphes numérotés d'un texte source, pour un plan : chaque section analyse une plage de
// paragraphes (§3 à §7), et son développement ne reçoit que ce passage, copié du texte tel quel.
//
// Les paragraphes sont les blocs séparés par une ligne vide. Un bloc trop long (texte tiré d'un PDF,
// sans lignes vides) est coupé en fins de phrase ; un bloc très court (un titre) rejoint le suivant.

const MAX_CHARS = 1500
const MIN_CHARS = 80

export function sourceParagraphs(text: string): string[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap(splitLong)
  const out: string[] = []
  let carry = ''
  for (const block of blocks) {
    const joined = carry ? `${carry}\n${block}` : block
    if (joined.length < MIN_CHARS) carry = joined
    else {
      out.push(joined)
      carry = ''
    }
  }
  // Un reste trop court (un dernier titre, une signature) rejoint le paragraphe précédent.
  if (carry && out.length) out[out.length - 1] += `\n${carry}`
  else if (carry) out.push(carry)
  return out
}

/** Coupe un bloc trop long en fins de phrase (sans rien changer au texte). */
function splitLong(block: string): string[] {
  if (block.length <= MAX_CHARS) return [block]
  const sentences = block.match(/[^.!?…]+(?:[.!?…]+["»”’)\]]*\s*|$)/g) ?? [block]
  const out: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > MAX_CHARS) {
      out.push(current.trim())
      current = ''
    }
    current += sentence
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/** Le texte, paragraphes numérotés à partir de 1 : « [§1] … ». */
export function numberedSource(paragraphs: string[]): string {
  return paragraphs.map((p, i) => `[§${i + 1}] ${p}`).join('\n\n')
}

/** Le passage d'une plage de paragraphes (numéros de 1 à n, bornes comprises), numéros gardés. */
export function passageOf(paragraphs: string[], [from, to]: [number, number]): string {
  const first = Math.max(1, Math.min(from, to))
  const last = Math.min(paragraphs.length, Math.max(from, to))
  return paragraphs
    .slice(first - 1, last)
    .map((p, i) => `[§${first + i}] ${p}`)
    .join('\n\n')
}
