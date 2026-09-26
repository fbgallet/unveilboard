// Télécommande sur téléphone : protocole commun à l'ordinateur (hôte) et au téléphone.
// Connexion directe entre les deux navigateurs (WebRTC, via PeerJS) : la mise en relation passe par
// le service public de PeerJS, puis les messages circulent sans serveur, chiffrés. Rien n'est stocké.
// Pas de relais pour l'instant : sur certains réseaux (Wi-Fi d'établissement, 5G), la connexion
// directe échoue ; le diagnostic le dit clairement.

export type RemoteCommand = 'next' | 'previous' | 'overview' | 'recenter'

export interface RemoteState {
  presenting: boolean
  title: string
  /** -1 : avant la première étape. */
  index: number
  total: number
  stepTitle: string
  narration: string
  nextTitle: string | null
  /** Temps écoulé depuis le début de la présentation, au moment de l'envoi (les horloges des deux appareils peuvent différer). */
  elapsedMs: number
}

/** Téléphone → ordinateur. */
export type PhoneMessage = { type: 'command'; command: RemoteCommand }
/** Ordinateur → téléphone. */
export type HostMessage = { type: 'state'; state: RemoteState }

/** Chemin réseau obtenu : même réseau local, à travers Internet sans relais, ou par un relais (TURN). */
export type ConnectionKind = 'local' | 'internet' | 'relay' | 'unknown'

/** Délai au-delà duquel une connexion qui ne s'établit pas est déclarée impossible. */
export const REMOTE_CONNECT_TIMEOUT_MS = 15000

/** Identifiant PeerJS de l'ordinateur : aléatoire et non devinable, il sert de secret dans le QR code. */
export function newHostId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return `unveilboard-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export const isHostId = (id: string) => /^unveilboard-[0-9a-f]{24}$/.test(id)

/** Lit dans les statistiques WebRTC le type de la paire de candidats retenue. */
export async function connectionKind(pc: RTCPeerConnection | undefined): Promise<ConnectionKind> {
  if (!pc) return 'unknown'
  try {
    const stats = await pc.getStats()
    let pairId: string | undefined
    stats.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId
    })
    let pair: RTCIceCandidatePairStats | undefined
    stats.forEach((s) => {
      if (s.type === 'candidate-pair' && (s.id === pairId || (!pairId && s.nominated && s.state === 'succeeded'))) pair = s
    })
    if (!pair) return 'unknown'
    const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined
    const remote = stats.get(pair.remoteCandidateId) as { candidateType?: string } | undefined
    const types = [local?.candidateType, remote?.candidateType]
    if (types.includes('relay')) return 'relay'
    // srflx : adresse vue de l'extérieur (STUN), donc à travers Internet. « prflx », découverte en cours
    // de connexion, est fréquente sur un réseau local (adresses masquées par mDNS) : on la compte comme locale.
    if (types.includes('srflx')) return 'internet'
    return types.every((t) => t === 'host' || t === 'prflx') ? 'local' : 'unknown'
  } catch {
    return 'unknown'
  }
}
