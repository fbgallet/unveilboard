'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/client'

/**
 * QR code d'une adresse, en SVG. Toujours noir sur blanc, même en mode sombre : les lecteurs de
 * QR code, surtout à travers un projecteur, lisent mal les codes inversés ou peu contrastés.
 */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toString(value, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(null))
    return () => {
      cancelled = true
    }
  }, [value])
  if (!svg) return null
  // SVG produit par la bibliothèque à partir de notre propre adresse.
  return <div className={`qr-code ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** QR code en grand, sur toute la fenêtre : à projeter pour que les élèves ouvrent le lien. */
export function QrOverlay({ value, title, onClose }: { value: string; title?: string; onClose(): void }) {
  const t = useT()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose])
  return (
    <div className="qr-overlay" onClick={onClose} role="dialog" aria-label={t.share.qr} title={t.share.qrClose}>
      {title && <p className="qr-overlay-title">{title}</p>}
      <QrCode value={value} className="qr-overlay-code" />
      <p className="qr-overlay-url">{value.replace(/^https?:\/\//, '')}</p>
    </div>
  )
}
