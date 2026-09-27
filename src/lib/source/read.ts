// Lecture d'une source (cours, texte d'auteur) dans le navigateur, sans rien envoyer :
// - texte et Markdown : tels quels ;
// - PDF : sa couche de texte (pdf.js), gratuite et privée ;
// - photo, ou PDF scanné (sans couche de texte) : à transcrire par un modèle multimodal
//   (src/lib/ai/transcribe.ts), si l'utilisateur le veut.

/** Taille maximale d'un fichier à transcrire (une photo, un PDF scanné de quelques pages). */
export const MAX_TRANSCRIBE_BYTES = 3 * 1024 * 1024
/** Longueur maximale d'une source (au-delà, mieux vaut en choisir un passage). */
export const MAX_SOURCE_CHARS = 300_000
/** Au-delà : texte long, à réserver aux modèles à grand contexte. */
export const LONG_SOURCE_CHARS = 60_000

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export type SourceRead =
  | { kind: 'text'; text: string; name: string }
  /** À transcrire : une image, ou un PDF sans texte. */
  | { kind: 'transcribe'; file: File; name: string; reason: 'image' | 'scanned' }
  | { kind: 'unsupported'; name: string }

export async function readSourceFile(file: File): Promise<SourceRead> {
  const name = file.name
  const type = file.type.split(';')[0].trim().toLowerCase()
  if (type.startsWith('text/') || /\.(txt|md|markdown)$/i.test(name)) return { kind: 'text', text: await file.text(), name }
  if (IMAGE_TYPES.includes(type)) return { kind: 'transcribe', file, name, reason: 'image' }
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
    const text = await pdfText(file)
    // Presque rien de lisible : un PDF scanné (des images de pages).
    return text.replace(/\s/g, '').length >= 40 ? { kind: 'text', text, name } : { kind: 'transcribe', file, name, reason: 'scanned' }
  }
  return { kind: 'unsupported', name }
}

/** Texte d'un PDF, page par page (lignes et paragraphes gardés au mieux). */
async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      text += item.str + (item.hasEOL ? '\n' : '')
    }
    pages.push(text.trim())
  }
  await task.destroy()
  return pages.filter(Boolean).join('\n\n')
}

/** Contenu d'un fichier en « data: » URI (pour une transcription). */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Estimation grossière du nombre de jetons d'un texte (environ 4 caractères par jeton). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4)
