import { collection, orderBy, query } from 'firebase/firestore'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Spinner } from '../../components/ui'
import { createSession, deleteSession, endSession } from '../../engine/engine'
import { db } from '../../firebase'
import { useCol } from '../../lib/hooks'
import { ConfirmButton } from '../../components/ControlPanel'
import type { Session } from '../../types'

const STATUS: Record<Session['status'], string> = { waiting: 'Ouverte', playing: 'En cours', done: 'Terminée' }

export function SessionsTab() {
  const sessions = useCol<Session>(query(collection(db, 'sessions'), orderBy('createdAt', 'desc')), 'all-sessions')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const navigate = useNavigate()

  if (!sessions) return <Spinner />
  const live = sessions.filter((s) => s.status !== 'done')
  const done = sessions.filter((s) => s.status === 'done')

  return (
    <div className="stack">
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            const id = await createSession(name, password.trim() || undefined)
            navigate(`/admin/session/${id}`)
          } finally {
            setBusy(false)
          }
        }}
      >
        <h3>Nouvelle session</h3>
        <div className="row wrap">
          <input placeholder="Nom (ex : Soirée chez Paul)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Mot de passe (optionnel)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            Créer
          </button>
        </div>
        <p className="muted small">Les joueurs voient la session sur la page d'accueil et la rejoignent d'un tap.</p>
      </form>

      <section>
        <h3>En cours</h3>
        {live.length ? (
          <ul className="list">
            {live.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </ul>
        ) : (
          <p className="muted">Aucune session ouverte.</p>
        )}
      </section>

      <section>
        <button className="btn btn-small" onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Masquer' : 'Voir'} l'historique ({done.length})
        </button>
        {showDone && (
          <ul className="list">
            {done.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SessionRow({ s }: { s: Session }) {
  const date = s.createdAt?.toDate?.()
  return (
    <li className="list-row">
      <div>
        <b>
          {s.hasPassword && '🔒 '}
          {s.name}
        </b>
        <div className="muted small">
          {STATUS[s.status]}
          {date && ` · ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
          {s.grandJeu && ` · 🏁 ${s.grandJeu.name}`}
        </div>
      </div>
      <div className="row">
        <Link className="btn btn-small btn-primary" to={`/admin/session/${s.id}`}>
          🎛️ Régie
        </Link>
        <a className="btn btn-small" href={`/ecran/${s.id}`} target="_blank" rel="noreferrer">
          📺 Écran
        </a>
        {s.status !== 'done' ? (
          <ConfirmButton className="btn btn-small" confirmLabel="Terminer ?" onConfirm={() => endSession(s.id)}>
            Terminer
          </ConfirmButton>
        ) : (
          <ConfirmButton className="btn btn-small btn-danger" confirmLabel="Supprimer ?" onConfirm={() => deleteSession(s.id)}>
            Supprimer
          </ConfirmButton>
        )}
      </div>
    </li>
  )
}
