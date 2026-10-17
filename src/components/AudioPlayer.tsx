import { useEffect, useRef, useState } from 'react'

/** Lecteur audio qui tente de démarrer tout seul ; si le navigateur bloque, affiche un gros bouton */
export function AudioPlayer({ src, playing = true }: { src: string; playing?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const a = ref.current
    if (!a) return
    setError(false)
    if (playing) {
      a.play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true))
    } else a.pause()
  }, [src, playing])

  return (
    <div className="audio">
      <audio ref={ref} src={src} preload="auto" onError={() => setError(true)} controls={!blocked} />
      {blocked && (
        <button
          className="btn btn-primary btn-big"
          onClick={() =>
            ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setError(true))
          }
        >
          ▶️ Lancer l'extrait
        </button>
      )}
      {error && <p className="error small">Extrait audio introuvable (lien expiré ?)</p>}
    </div>
  )
}
