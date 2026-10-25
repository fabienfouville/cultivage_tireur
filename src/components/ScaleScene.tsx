import { useEffect, useState } from 'react'

/** Une figure posée sur le sol : une image (ou un émoji) dessinée à l'échelle de sa taille réelle */
export interface Figure {
  label: string
  /** taille réelle en mètres ; null = inconnue (affichée en « ? ») */
  meters: number | null
  emoji?: string
  image?: string
  /** la taille est une longueur (mesurée à l'horizontale : baleine, train…) plutôt qu'une hauteur */
  length?: boolean
}

/** Format lisible d'une taille en mètres */
export function formatMeters(m: number): string {
  if (!Number.isFinite(m)) return '?'
  if (m < 1) return `${Math.round(m * 100)} cm`
  if (m < 10) return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m`
  if (m < 1000) return `${Math.round(m).toLocaleString('fr-FR')} m`
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`
}

/** Proportions (largeur / hauteur) des images, mesurées une fois chargées */
const ratios = new Map<string, number>()
function useRatios(urls: string[]): Record<string, number> {
  const [, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    for (const url of urls) {
      if (ratios.has(url)) continue
      const img = new Image()
      img.onload = () => {
        ratios.set(url, img.naturalWidth / Math.max(1, img.naturalHeight))
        if (alive) setTick((t) => t + 1)
      }
      img.src = url
    }
    return () => {
      alive = false
    }
  }, [urls.join('|')])
  return Object.fromEntries(urls.map((u) => [u, ratios.get(u) ?? 1]))
}

/**
 * Scène de comparaison : les figures côte à côte sur le même sol, à la même échelle. Une figure « longueur » est
 * dessinée avec sa largeur à l'échelle, une figure « hauteur » avec sa hauteur. Les estimations des joueurs sont des
 * traits pointillés (horizontaux pour une hauteur, verticaux pour une longueur) à la révélation.
 */
export function ScaleScene({
  figures,
  marks = [],
  height = 320,
  unknownMeters,
}: {
  figures: Figure[]
  /** estimations des joueurs, pour la dernière figure (celle à deviner) */
  marks?: { meters: number; label: string; color?: string }[]
  height?: number
  /** taille affichée pour une figure inconnue (« ? ») */
  unknownMeters?: number
}) {
  const W = 600
  const H = 400
  const ground = H - 40
  const top = 24
  const gap = 36
  const r = useRatios(figures.flatMap((f) => (f.image ? [f.image] : [])))

  // Taille de chaque figure en mètres (largeur × hauteur)
  const boxes = figures.map((f, i) => {
    const m = f.meters ?? unknownMeters ?? 1
    const ratio = f.image ? r[f.image] : f.meters == null ? 0.6 : 1
    const w = f.length ? m : m * ratio
    const h = f.length ? m / ratio : m
    // La place des estimations des joueurs compte aussi (dernière figure)
    const extra = i === figures.length - 1 && marks.length ? Math.max(...marks.map((k) => k.meters)) : 0
    return { w, h, reachW: f.length ? Math.max(w, extra) : w, reachH: f.length ? h : Math.max(h, extra) }
  })
  const maxH = Math.max(...boxes.map((b) => b.reachH), 1e-6)
  const sumW = boxes.reduce((s, b) => s + b.reachW, 0) || 1e-6
  // Une petite figure garde assez de place pour son nom : on réduit l'échelle des grandes en conséquence
  const MIN_SLOT = 120
  let scale = Math.min((ground - top) / maxH, (W - 20 - gap * (figures.length - 1)) / sumW)
  for (let k = 0; k < 3; k++) {
    const small = boxes.filter((b) => b.reachW * scale < MIN_SLOT)
    const room = W - 20 - gap * (figures.length - 1) - small.length * MIN_SLOT
    const bigW = boxes.filter((b) => b.reachW * scale >= MIN_SLOT).reduce((t, b) => t + b.reachW, 0)
    if (bigW > 0 && bigW * scale > room) scale = Math.max(1e-6, room / bigW)
  }
  const slots = boxes.map((b) => Math.max(b.reachW * scale, MIN_SLOT))
  const used = slots.reduce((t, w) => t + w, 0) + gap * (figures.length - 1)
  let x = Math.max(0, (W - used) / 2)
  // Le nom reste dans le cadre même sous une figure collée au bord (largeur estimée du texte)
  const labelX = (cx: number, text: string) => {
    const half = (text.length * 8.6) / 2 + 4
    return Math.min(W - half, Math.max(half, cx))
  }

  return (
    <svg className="scale-scene" viewBox={`0 0 ${W} ${H}`} style={{ height, maxWidth: '100%' }} role="img" aria-label="Comparaison de tailles">
      <line x1={0} x2={W} y1={ground} y2={ground} stroke="currentColor" strokeOpacity={0.35} strokeWidth={2} />
      {figures.map((f, i) => {
        const b = boxes[i]
        const w = Math.max(3, b.w * scale)
        const h = Math.max(3, b.h * scale)
        const left = x + (slots[i] - b.reachW * scale) / 2
        const cx = x + slots[i] / 2
        x += slots[i] + gap
        const known = f.meters != null
        const last = i === figures.length - 1
        return (
          <g key={i}>
            {known && f.image ? (
              <image href={f.image} x={left} y={ground - h} width={w} height={h} preserveAspectRatio="none" />
            ) : known && f.emoji ? (
              // Un émoji occupe environ 1,15 fois sa taille de police en hauteur
              <text x={left + w / 2} y={ground} textAnchor="middle" fontSize={h / 1.15} dominantBaseline="text-after-edge">
                {f.emoji}
              </text>
            ) : (
              <g>
                <rect x={left} y={ground - h} width={w} height={h} rx={8} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeOpacity={0.4} strokeDasharray="5 4" />
                <text x={left + w / 2} y={ground - h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(60, h / 2, w)} fill="currentColor" fillOpacity={0.6}>
                  ?
                </text>
              </g>
            )}
            {last &&
              marks.map((m, k) =>
                f.length ? (
                  <g key={k}>
                    <line x1={left + m.meters * scale} x2={left + m.meters * scale} y1={top} y2={ground} stroke={m.color ?? '#e4572e'} strokeDasharray="6 5" strokeWidth={2} />
                    <text x={left + m.meters * scale + 3} y={top + 12 + (k % 4) * 14} fontSize={13} fill={m.color ?? '#e4572e'}>
                      {m.label}
                    </text>
                  </g>
                ) : (
                  <g key={k}>
                    <line x1={10} x2={W - 10} y1={ground - m.meters * scale} y2={ground - m.meters * scale} stroke={m.color ?? '#e4572e'} strokeDasharray="6 5" strokeWidth={2} />
                    <text x={W - 12} y={ground - m.meters * scale - 4} textAnchor="end" fontSize={14} fill={m.color ?? '#e4572e'}>
                      {m.label}
                    </text>
                  </g>
                ),
              )}
            <text x={labelX(cx, `${f.label}${known ? ` · ${formatMeters(f.meters!)}` : ''}`)} y={ground + 24} textAnchor="middle" fontSize={16} fill="currentColor" fontWeight={700}>
              {f.label}
              {known ? ` · ${formatMeters(f.meters!)}` : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
