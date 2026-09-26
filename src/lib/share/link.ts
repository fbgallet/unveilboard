// Lien autonome : le document entier, compressé, dans le fragment de l'URL (/p#…).
// Le fragment n'est jamais envoyé au serveur : rien n'est stocké, rien ne peut être publié à l'insu de l'auteur.
// Les images intégrées (data URL) sont retirées : elles rendraient le lien démesuré.

import type { TLStoreSnapshot } from 'tldraw'

const PREFIX = 'v1.'

/** Au-delà, le lien risque d'être tronqué par certaines messageries (indicatif). */
export const LONG_LINK_CHARS = 8000

export interface EncodedShare {
  /** Fragment, sans le #. */
  fragment: string
  /** Images intégrées retirées du lien. */
  droppedImages: number
}

export async function encodeShare(snapshot: TLStoreSnapshot): Promise<EncodedShare> {
  const { snapshot: light, droppedImages } = withoutEmbeddedImages(snapshot)
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(light)), new CompressionStream('deflate-raw'))
  return { fragment: PREFIX + toBase64Url(packed), droppedImages }
}

/**
 * Ce qu'on partage d'un document : sans les images intégrées (data URL), qui restent dans le document,
 * ni l'enregistrement « user » de tldraw (nom et couleur de l'auteur).
 */
export function withoutEmbeddedImages(snapshot: TLStoreSnapshot) {
  let droppedImages = 0
  const store = Object.fromEntries(
    Object.entries(snapshot.store)
      .filter(([, record]) => record.typeName !== 'user')
      .map(([id, record]) => {
        const src = (record as { props?: { src?: unknown } }).props?.src
        if (record.typeName !== 'asset' || typeof src !== 'string' || !src.startsWith('data:')) return [id, record]
        droppedImages++
        const withProps = record as unknown as { props: Record<string, unknown> }
        return [id, { ...record, props: { ...withProps.props, src: null } }]
      })
  )
  return { snapshot: { store, schema: snapshot.schema } as TLStoreSnapshot, droppedImages }
}

/** null : fragment absent ou illisible. */
export async function decodeShare(fragment: string): Promise<TLStoreSnapshot | null> {
  if (!fragment.startsWith(PREFIX)) return null
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(fragment.slice(PREFIX.length)), new DecompressionStream('deflate-raw')))
    const data = JSON.parse(json) as TLStoreSnapshot
    return data && typeof data.store === 'object' && data.schema ? data : null
  } catch {
    return null
  }
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}
