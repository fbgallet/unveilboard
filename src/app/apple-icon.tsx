import { ImageResponse } from 'next/og'
import { logoMarkDataUri } from '@/lib/brandImage'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
  return new ImageResponse(<img src={await logoMarkDataUri({ square: true })} width={180} height={180} alt="" />, size)
}
