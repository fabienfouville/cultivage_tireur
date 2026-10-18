/** Une figure posée sur le sol : un émoji (ou une image) dont la hauteur est proportionnelle à sa taille réelle */
export interface Figure {
  label: string
  /** taille réelle en mètres ; null = inconnue (affichée en « ? ») */
  meters: number | null
  emoji?: string
  image?: string
  color?: string
}

/** Format lisible d'une taille en mètres */
export function formatMeters(m: number): string {
  if (!Number.isFinite(m)) return '?'
  if (m < 1) return `${Math.round(m * 100)} cm`
  if (m < 10) return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m`
  if (m < 1000) return `${Math.round(m).toLocaleString('fr-FR')} m`
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`
}

/**
 * Scène de comparaison : les figures côte à côte, à la même échelle, avec des traits horizontaux
 * optionnels (les estimations des joueurs) à la révélation.
 */
export function ScaleScene({
  figures,
  marks = [],
  height = 320,
  unknownMeters,
}: {
  figures: Figure[]
  marks?: { meters: number; label: string; color?: string }[]
  height?: number
  /** hauteur affichée pour une figure inconnue (« ? ») */
  unknownMeters?: number
}) {
  const W = 600
  const H = 400
  const ground = H - 40
  const top = 30
  const sizes = [
    ...figures.map((f) => f.meters ?? unknownMeters ?? 0),
    ...marks.map((m) => m.meters),
  ].filter((n) => n > 0)
  const max = Math.max(...sizes, 0.01)
  const px = (m: number) => (m / max) * (ground - top)
  const slot = W / Math.max(1, figures.length)
  return (
    <svg className="scale-scene" viewBox={`0 0 ${W} ${H}`} style={{ height, maxWidth: '100%' }} role="img" aria-label="Comparaison de tailles">
      <line x1={0} x2={W} y1={ground} y2={ground} stroke="currentColor" strokeOpacity={0.35} strokeWidth={2} />
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={10} x2={W - 10} y1={ground - px(m.meters)} y2={ground - px(m.meters)} stroke={m.color ?? '#e4572e'} strokeDasharray="6 5" strokeWidth={2} />
          <text x={W - 12} y={ground - px(m.meters) - 4} textAnchor="end" fontSize={14} fill={m.color ?? '#e4572e'}>
            {m.label}
          </text>
        </g>
      ))}
      {figures.map((f, i) => {
        const cx = slot * i + slot / 2
        const known = f.meters != null
        const h = Math.max(4, px(f.meters ?? unknownMeters ?? max))
        return (
          <g key={i}>
            {f.image && known ? (
              <image href={f.image} x={cx - h / 2} y={ground - h} width={h} height={h} preserveAspectRatio="xMidYMax meet" />
            ) : known && f.emoji ? (
              // Un émoji occupe environ 1,15 fois sa taille de police en hauteur
              <text x={cx} y={ground} textAnchor="middle" fontSize={h / 1.15} dominantBaseline="text-after-edge">
                {f.emoji}
              </text>
            ) : (
              <g>
                <rect x={cx - Math.min(60, h / 3)} y={ground - h} width={Math.min(120, (2 * h) / 3)} height={h} rx={8} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeOpacity={0.4} strokeDasharray="5 4" />
                <text x={cx} y={ground - h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(60, h / 2)} fill="currentColor" fillOpacity={0.6}>
                  ?
                </text>
              </g>
            )}
            <text x={cx} y={ground + 24} textAnchor="middle" fontSize={16} fill="currentColor" fontWeight={700}>
              {f.label}
              {known ? ` · ${formatMeters(f.meters!)}` : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
