import { useEffect, useRef, useState } from 'react'

/**
 * Nombre de « gros pixels » en largeur selon l'avancement (0 → 1).
 * Croissance exponentielle avec une courbe : l'image se précise très peu au début
 * (le temps de réfléchir et d'écrire pour les plus forts) puis de plus en plus vite à la fin.
 */
export function pixelColumns(progress: number, width: number, startCells: number, curve: number): number {
  const p = Math.min(1, Math.max(0, progress))
  const start = Math.max(2, Math.min(startCells, width))
  return Math.min(width, Math.round(start * Math.pow(width / start, Math.pow(p, curve))))
}

/**
 * Image pixellisée qui se précise avec le temps.
 * `progress` de 0 (début, très pixellisé) à 1 (net).
 */
export function PixelImage({
  src,
  progress,
  startCells = 5,
  curve = 2.5,
}: {
  src: string
  progress: number
  /** largeur de l'image au départ, en gros pixels */
  startCells?: number
  /** plus c'est grand, plus l'image reste illisible longtemps */
  curve?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setImg(null)
    setFailed(false)
    // Pas besoin de CORS : on ne fait que dessiner (jamais relire les pixels)
    const i = new Image()
    i.onload = () => setImg(i)
    i.onerror = () => setFailed(true)
    i.src = src
  }, [src])

  const w = img ? Math.min(img.naturalWidth || 600, 900) : 900
  const cols = pixelColumns(progress, w, startCells, curve)

  useEffect(() => {
    const c = canvas.current
    if (!c || !img) return
    const h = Math.round(w * ((img.naturalHeight || 400) / (img.naturalWidth || 600)))
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const sw = Math.max(1, cols)
    const sh = Math.max(1, Math.round((cols * h) / w))
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, w, h)
    // On dessine l'image en tout petit puis on l'agrandit sans lissage → gros pixels
    ctx.drawImage(img, 0, 0, sw, sh)
    ctx.drawImage(c, 0, 0, sw, sh, 0, 0, w, h)
  }, [img, cols, w])

  if (failed) return <div className="pixel-fail">Image indisponible</div>
  return <canvas ref={canvas} className="pixel-img" />
}
