import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Ressources des images générées (partage, icône Apple) : le pictogramme de src/app/icon.svg
// et la police serif du site, que ImageResponse ne peut pas prendre à next/font.

/** Pictogramme en data URI. `square` : tuile sans arrondi (iOS applique son propre masque). */
export async function logoMarkDataUri({ square = false } = {}) {
  let svg = await readFile(join(process.cwd(), 'src/app/icon.svg'), 'utf8')
  // Sans la variante sombre (media query), que le moteur de rendu des images ignorerait ou appliquerait mal.
  svg = svg.replace(/<style>[\s\S]*<\/style>/, '')
  if (square) svg = svg.replace('rx="8"', 'rx="0"')
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

export async function serifFonts() {
  const font = (file: string) => readFile(join(process.cwd(), 'assets/fonts', file))
  const [semiBold, italic] = await Promise.all([font('SourceSerif4-SemiBold.ttf'), font('SourceSerif4-Italic.ttf')])
  return [
    { name: 'Serif', data: semiBold, weight: 600 as const, style: 'normal' as const },
    { name: 'Serif', data: italic, weight: 400 as const, style: 'italic' as const },
  ]
}
