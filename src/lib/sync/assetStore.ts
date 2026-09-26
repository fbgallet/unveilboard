import type { TLAssetStore } from 'tldraw'
import { m } from '@/i18n/client'

/**
 * Images : téléversées vers Vercel Blob quand il est configuré.
 * Sinon (ou hors ligne), elles restent intégrées au document en data URL.
 */
export const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    return { src: await uploadImage(file) }
  },
}

/** Taille maximale d'une image intégrée à une note sans stockage en ligne (elle alourdit le document). */
export const MAX_INLINE_NOTE_IMAGE = 1024 * 1024

/** Téléverse une image et renvoie son adresse, ou la renvoie en data URL (sans stockage en ligne). */
export async function uploadImage(file: File): Promise<string> {
  return (await uploadImageOnline(file)) ?? fileToDataUrl(file)
}

/** Adresse de l'image téléversée (Vercel Blob) ; null sans stockage en ligne ou hors ligne. */
export async function uploadImageOnline(file: File): Promise<string | null> {
  let res: Response
  try {
    const body = new FormData()
    body.append('file', file)
    res = await fetch('/api/assets', { method: 'POST', body })
  } catch {
    return null // réseau indisponible : repli sur l'intégration
  }
  if (res.ok) return ((await res.json()) as { url: string }).url
  if (res.status === 413) throw new Error(m().errors.imageTooLarge)
  return null
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
