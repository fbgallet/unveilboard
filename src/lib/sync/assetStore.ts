import type { TLAssetStore } from 'tldraw'

/**
 * Images : téléversées vers Vercel Blob quand il est configuré.
 * Sinon (ou hors ligne), elles restent intégrées au document en data URL.
 */
export const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/assets', { method: 'POST', body })
      if (res.ok) return { src: ((await res.json()) as { url: string }).url }
      if (res.status === 413) throw new Error('Image trop volumineuse (4 Mo maximum).')
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Image trop')) throw e
      // réseau indisponible : repli sur l'intégration
    }
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
