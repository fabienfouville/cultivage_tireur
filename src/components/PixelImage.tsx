import { useEffect, useRef, useState } from 'react'

/**
 * Image pixellisée qui se précise avec le temps.
 * `progress` de 0 (début, très pixellisé) à 1 (net).
 */
export function PixelImage({ src, progress, maxBlock = 32 }: { src: string; progress: number; maxBlock?: number }) {
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

  // Taille de bloc : 32 px → 1 px, en accélérant vers la fin
  const p = Math.min(1, Math.max(0, progress))
  const block = Math.max(1, Math.round(maxBlock * Math.pow(1 - p, 1.6)))

  useEffect(() => {
    const c = canvas.current
    if (!c || !img) return
    const w = Math.min(img.naturalWidth || 600, 900)
    const h = Math.round(w * ((img.naturalHeight || 400) / (img.naturalWidth || 600)))
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const sw = Math.max(1, Math.ceil(w / block))
    const sh = Math.max(1, Math.ceil(h / block))
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, w, h)
    // On dessine l'image en tout petit puis on l'agrandit sans lissage → gros pixels
    ctx.drawImage(img, 0, 0, sw, sh)
    ctx.drawImage(c, 0, 0, sw, sh, 0, 0, w, h)
  }, [img, block])

  if (failed) return <div className="pixel-fail">Image indisponible</div>
  return <canvas ref={canvas} className="pixel-img" />
}
