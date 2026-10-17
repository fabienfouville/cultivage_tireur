import { collection, doc } from 'firebase/firestore'
import { useState } from 'react'
import { useParams } from 'react-router'
import { ControlPanel } from '../../components/ControlPanel'
import { Header, Spinner, TimerBar, playerUrl } from '../../components/ui'
import { setSessionPassword } from '../../engine/engine'
import { useHost } from '../../engine/useHost'
import { db } from '../../firebase'
import { remaining } from '../../lib/clock'
import { useCol, useDoc } from '../../lib/hooks'
import type { Participant, Session } from '../../types'
import { AdminGate } from './AdminGate'

export default function ControlPage() {
  return (
    <AdminGate>
      <Control />
    </AdminGate>
  )
}

/** La régie d'une session (pensée pour le téléphone de l'animateur) */
function Control() {
  const { sid = '' } = useParams()
  const session = useDoc<Session>(doc(db, 'sessions', sid))
  const participants = useCol<Participant>(collection(db, 'sessions', sid, 'participants'), `p-${sid}`) ?? []
  const secret = useDoc<{ password: string }>(doc(db, 'sessionSecrets', sid))
  const { now } = useHost(session, true)
  const [copied, setCopied] = useState(false)

  if (session === undefined) return <Spinner />
  if (session === null) return <div className="page center">Session introuvable</div>
  const round = session.round

  return (
    <div className="page narrow">
      <Header
        title={session.name}
        back="/admin"
        right={
          <a className="btn btn-small" href={`/ecran/${sid}`} target="_blank" rel="noreferrer">
            📺 Écran
          </a>
        }
      />
      {round?.status === 'answering' && <TimerBar left={remaining(round.startedAt, round.duration, now)} total={round.duration} />}
      <ControlPanel session={session} participants={participants} />
      <details className="card">
        <summary>Partage et mot de passe</summary>
        <p className="small">
          Lien joueurs :{' '}
          <button
            className="btn btn-small"
            onClick={() => navigator.clipboard?.writeText(playerUrl(sid)).then(() => setCopied(true))}
          >
            {copied ? 'Copié ✓' : playerUrl(sid)}
          </button>
        </p>
        <PasswordForm sid={sid} current={secret?.password ?? ''} />
      </details>
    </div>
  )
}

function PasswordForm({ sid, current }: { sid: string; current: string }) {
  const [pw, setPw] = useState<string | null>(null)
  const value = pw ?? current
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        void setSessionPassword(sid, value.trim()).then(() => setPw(null))
      }}
    >
      <input placeholder="Mot de passe (vide = aucun)" value={value} onChange={(e) => setPw(e.target.value)} />
      <button className="btn">Enregistrer</button>
    </form>
  )
}
