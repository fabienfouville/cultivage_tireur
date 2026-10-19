import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Après une mise en ligne, un onglet resté ouvert peut demander un fichier de l'ancienne version (écran, admin…)
// qui n'existe plus : on recharge la page une fois pour récupérer la nouvelle version.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('cultivage:reloaded') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('cultivage:reloaded', String(Date.now()))
  } catch {
    /* navigation privée */
  }
  event.preventDefault()
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
