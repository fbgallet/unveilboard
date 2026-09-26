import type { Metadata } from 'next'
import { RemotePhone } from '@/components/RemotePhone'

// Télécommande sur téléphone. L'identifiant de l'ordinateur est dans le fragment (#…) : le serveur
// ne le reçoit jamais, et la page est la même pour tous.
export const metadata: Metadata = { title: 'Unveilboard', robots: { index: false } }

export default function RemotePage() {
  return <RemotePhone />
}
