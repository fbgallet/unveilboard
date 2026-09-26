import 'server-only'

// Clé tldraw lue à l'exécution (et non intégrée au build) : elle peut rester une variable
// « sensible » sur Vercel, et la changer ne demande pas de redéploiement. Elle n'est pas secrète :
// tldraw la vérifie dans le navigateur, et elle ne vaut que pour les domaines déclarés.
export const tldrawLicenseKey = () => process.env.TLDRAW_LICENSE_KEY || process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY || undefined
