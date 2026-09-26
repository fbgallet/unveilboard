import { ImageResponse } from 'next/og'
import { logoMarkDataUri, serifFonts } from '@/lib/brandImage'

// Image de partage (réseaux sociaux, messageries). En anglais : l'aperçu ne connaît pas la langue du lecteur.
export const alt = 'Unveilboard — Show your diagrams step by step'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const [mark, fonts] = await Promise.all([logoMarkDataUri(), serifFonts()])
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fbfaf7',
          fontFamily: 'Serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <img src={mark} width={132} height={132} alt="" />
          <div style={{ display: 'flex', fontSize: 112, letterSpacing: -2, color: '#1c1917' }}>
            <span style={{ fontWeight: 600 }}>Unveil</span>
            <span style={{ fontStyle: 'italic', color: '#78716c' }}>board</span>
          </div>
        </div>
        <div style={{ marginTop: 44, fontSize: 44, fontStyle: 'italic', color: '#57534e' }}>
          Show your diagrams step by step
        </div>
      </div>
    ),
    { ...size, fonts }
  )
}
