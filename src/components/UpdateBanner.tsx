import { useEffect, useState } from 'react'

const CURRENT = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

/**
 * Une nouvelle version a été mise en ligne pendant que la page était ouverte : on propose de recharger.
 * Pas de rechargement automatique, pour ne jamais couper un joueur en pleine réponse.
 */
export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false)
  useEffect(() => {
    if (import.meta.env.DEV) return
    const check = () =>
      fetch('/version.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => v?.build && v.build !== CURRENT && setOutdated(true))
        .catch(() => {})
    const t = setInterval(check, 2 * 60_000)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  if (!outdated) return null
  return (
    <button className="update-banner" onClick={() => location.reload()}>
      🔄 Nouvelle version du site : touche ici pour recharger
    </button>
  )
}
