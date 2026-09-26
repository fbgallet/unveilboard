// Logo : un petit schéma en cours de dévoilement. Le nœud du haut est affiché, celui de gauche
// vient d'apparaître (surligné), celui de droite attend encore son tour (pointillés).
// Au survol, ce dernier se dévoile à son tour. Même dessin que src/app/icon.svg.
// Couleurs de la palette : dans l'éditeur en mode sombre, la tuile devient claire (voir globals.css).

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--color-stone-900)" />
      <path d="M14 13 9 19" stroke="var(--color-stone-50)" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M18 13 23 19"
        stroke="var(--color-stone-500)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="1 2.25"
        className="transition-[stroke] duration-500 group-hover:stroke-stone-50 group-hover:[stroke-dasharray:none]"
      />
      <rect x="10" y="7" width="12" height="6" rx="2" fill="var(--color-stone-50)" />
      <rect x="4" y="19" width="10" height="6" rx="2" fill="#f59e0b" />
      <rect
        x="18.75"
        y="19.75"
        width="8.5"
        height="4.5"
        rx="1.5"
        fill="transparent"
        stroke="var(--color-stone-500)"
        strokeWidth="1.5"
        strokeDasharray="1.75 1.75"
        className="transition-[fill,stroke] duration-500 group-hover:fill-stone-50 group-hover:stroke-stone-50 group-hover:[stroke-dasharray:none]"
      />
    </svg>
  )
}

const SIZES = {
  md: { mark: 'h-10 w-10', text: 'text-[28px]', gap: 'gap-3' },
  lg: { mark: 'h-12 w-12', text: 'text-4xl', gap: 'gap-3' },
}

/** Logo complet : pictogramme + nom. `size` règle les deux ensemble. */
export function Logo({ size = 'md' }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size]
  return (
    <span className={`group inline-flex items-center ${s.gap}`}>
      <LogoMark className={s.mark} />
      <span className={`font-serif leading-none tracking-tight text-stone-900 ${s.text}`}>
        <span className="font-semibold">Unveil</span>
        <span className="italic text-stone-500">board</span>
      </span>
    </span>
  )
}
