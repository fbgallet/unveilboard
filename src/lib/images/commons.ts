// Recherche d'images sur Wikimedia Commons : de vraies images (œuvres, portraits, documents,
// photos), avec leur auteur et leur licence, plutôt que des images inventées pour ce qui est réel.
// API publique, sans clé, appelée depuis le navigateur (origin=*).

const API = 'https://commons.wikimedia.org/w/api.php'

/** Une image trouvée, avec ce qu'il faut pour la citer. */
export interface CommonsImage {
  /** Titre lisible (nom de l'œuvre, sinon du fichier). */
  title: string
  /** Vignette (au plus 960 px de large), et sa taille. */
  thumb: string
  width: number
  height: number
  /** Page de l'image sur Commons (licence, auteur, original). */
  page: string
  author: string
  license: string
  licenseUrl?: string
  description: string
  date?: string
}

/** Texte d'un champ HTML de Commons : sans balises, ni blocs cachés, ni entités. */
export function plainText(html: string | undefined): string {
  if (!html) return ''
  return html
    .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Titre d'un fichier : « File:Eugène Delacroix - La liberté.jpg » → « Eugène Delacroix - La liberté ». */
export function fileTitle(title: string): string {
  return title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')
}

interface ApiPage {
  title: string
  index?: number
  imageinfo?: {
    thumburl?: string
    thumbwidth?: number
    thumbheight?: number
    descriptionurl?: string
    mime?: string
    extmetadata?: Record<string, { value?: string }>
  }[]
}

/** Adresse de la recherche (fichiers d'images, vignettes de 960 px, métadonnées utiles). */
export function searchUrl(query: string, limit = 30): string {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(limit),
    gsrsearch: `${query} filetype:bitmap|drawing`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '960',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|ObjectName|DateTimeOriginal',
  })
  return `${API}?${params}`
}

/** Réponse de l'API → images, dans l'ordre de pertinence. */
export function readSearch(body: unknown): CommonsImage[] {
  const pages = Object.values((body as { query?: { pages?: Record<string, ApiPage> } }).query?.pages ?? {})
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const info = p.imageinfo?.[0]
      if (!info?.thumburl || !info.descriptionurl) return []
      const meta = info.extmetadata ?? {}
      const name = plainText(meta.ObjectName?.value)
      const date = plainText(meta.DateTimeOriginal?.value)
      return [
        {
          // Nom de l'œuvre s'il est court (sinon, souvent en plusieurs langues) ; celui du fichier sinon.
          title: name && name.length <= 120 ? name : fileTitle(p.title),
          thumb: info.thumburl,
          width: info.thumbwidth ?? 960,
          height: info.thumbheight ?? 720,
          page: info.descriptionurl,
          author: plainText(meta.Artist?.value).slice(0, 200) || '?',
          license: plainText(meta.LicenseShortName?.value) || '?',
          ...(meta.LicenseUrl?.value && { licenseUrl: meta.LicenseUrl.value }),
          description: plainText(meta.ImageDescription?.value).slice(0, 1500),
          ...(date && { date: date.slice(0, 80) }),
        },
      ]
    })
}

/** Cherche des images sur Wikimedia Commons. */
export async function searchCommons(query: string, signal?: AbortSignal): Promise<CommonsImage[]> {
  const res = await fetch(searchUrl(query), { signal })
  if (!res.ok) throw new Error(`Wikimedia Commons: ${res.status}`)
  return readSearch(await res.json())
}

/** Crédit d'une image : « Auteur, licence ». */
export const creditOf = (image: Pick<CommonsImage, 'author' | 'license'>) =>
  [image.author !== '?' && image.author, image.license !== '?' && image.license].filter(Boolean).join(', ')
