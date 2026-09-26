import type { TLAssetStore } from 'tldraw'
import { m } from '@/i18n/client'

/**
 * Images : téléversées vers Vercel Blob quand il est configuré.
 * Sinon (ou hors ligne), elles restent intégrées au document en data URL.
 */
export const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    let tooLarge = false
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/assets', { method: 'POST', body })
      if (res.ok) return { src: ((await res.json()) as { url: string }).url }
      tooLarge = res.status === 413
    } catch {
      // réseau indisponible : repli sur l'intégration
    }
    if (tooLarge) throw new Error(m().errors.imageTooLarge)
    return { src: await fileToDataUrl(file) }
  },
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
