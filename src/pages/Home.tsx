import { collection, query, where } from 'firebase/firestore'
import { Link } from 'react-router'
import { Spinner } from '../components/ui'
import { db } from '../firebase'
import { useCol } from '../lib/hooks'
import type { Session } from '../types'

/** Accueil joueur : les sessions en cours, on touche pour rejoindre */
export default function Home() {
  const sessions = useCol<Session>(query(collection(db, 'sessions'), where('status', 'in', ['waiting', 'playing'])), 'live-sessions')
  const list = (sessions ?? []).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))

  return (
    <div className="page narrow">
      <header className="home-head">
        <h1>🌱 Cultivage</h1>
        <p className="muted">Choisis ta partie pour la rejoindre</p>
      </header>
      {sessions === undefined ? (
        <Spinner />
      ) : list.length ? (
        <ul className="session-list">
          {list.map((s) => (
            <li key={s.id}>
              <Link to={`/s/${s.id}`} className="session-item">
                <span className="session-name">
                  {s.hasPassword && '🔒 '}
                  {s.name}
                </span>
                <span className={'badge ' + (s.status === 'playing' ? 'badge-live' : '')}>
                  {s.status === 'playing' ? 'En cours' : 'Ouverte'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card center">
          <p>Aucune partie en cours pour l'instant.</p>
          <p className="muted small">Cette page se met à jour toute seule dès qu'une partie est créée.</p>
        </div>
      )}
      <footer className="home-foot">
        <Link to="/admin" className="muted small">
          Espace animateur
        </Link>
      </footer>
    </div>
  )
}
