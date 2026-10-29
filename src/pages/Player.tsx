import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { MyBlockResult } from '../components/BlockResults'
import { GameIntro } from '../components/GameIntro'
import { CardsPicker } from '../components/CardsPicker'
import { Header, Leaderboard, Podium, Spinner, TimerBar } from '../components/ui'
import { TORTUE_FACTOR } from '../engine/cards'
import { db } from '../firebase'
import { ensurePlayerAuth, useUser } from '../lib/auth'
import { remaining, useServerClock } from '../lib/clock'
import { useCol, useDoc } from '../lib/hooks'
import { getModule } from '../modules'
import { RevealList, ReviewList } from '../modules/common'
import { AutoNext } from '../components/AutoNext'
import type { Answer, Participant, Session } from '../types'

const NAME_KEY = 'cultivage:name'

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function Player() {
  const { sid = '' } = useParams()
  const user = useUser()
  const [authError, setAuthError] = useState('')
  // Pendant l'inscription, Firestore affiche le joueur avant que le serveur ait vérifié le mot de passe :
  // on garde le formulaire affiché jusqu'à la réponse pour ne pas perdre la saisie en cas de refus
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    if (user === null) ensurePlayerAuth().catch((e) => setAuthError(String(e?.message ?? e)))
  }, [user])

  const session = useDoc<Session>(doc(db, 'sessions', sid))
  const me = useDoc<Participant>(user ? doc(db, 'sessions', sid, 'participants', user.uid) : null, [user?.uid])

  if (authError) return <div className="page center error">Connexion impossible : {authError}</div>
  if (session === undefined || !user || me === undefined) return <Spinner />
  if (session === null)
    return (
      <div className="page center">
        <p>Cette session n'existe plus.</p>
        <Link to="/" className="btn">
          Voir les sessions
        </Link>
      </div>
    )
  if (!me || joining || joinError)
    return <Join session={session} uid={user.uid} setJoining={setJoining} error={joinError} setError={setJoinError} />
  if (me.kicked)
    return (
      <div className="page center">
        <div className="huge">🚪</div>
        <p>L'animateur t'a retiré de la partie.</p>
      </div>
    )
  return <PlayerGame session={session} me={me} />
}

function Join({
  session,
  uid,
  setJoining,
  error,
  setError,
}: {
  session: Session
  uid: string
  setJoining: (b: boolean) => void
  error: string
  setError: (e: string) => void
}) {
  const [name, setName] = useState(readName())
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (session.status === 'done')
    return (
      <div className="page center">
        <p>La session « {session.name} » est terminée.</p>
        <Link to="/" className="btn">
          Voir les sessions
        </Link>
      </div>
    )

  return (
    <div className="page narrow">
      <Header title={session.name} back="/" />
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault()
          setError('')
          setBusy(true)
          setJoining(true)
          try {
            if (session.hasPassword) {
              await setDoc(doc(db, 'sessions', session.id, 'keys', uid), { key: password }).catch(() => {
                // Déjà enregistré lors d'une visite précédente : on tente quand même de rejoindre
              })
            }
            await setDoc(doc(db, 'sessions', session.id, 'participants', uid), {
              name: name.trim().slice(0, 24),
              score: 0,
              joinedAt: serverTimestamp(),
            })
            try {
              localStorage.setItem(NAME_KEY, name.trim())
            } catch {
              /* navigation privée */
            }
          } catch (err: any) {
            setError(
              err?.code === 'permission-denied'
                ? session.hasPassword
                  ? 'Mot de passe incorrect.'
                  : 'Impossible de rejoindre cette session.'
                : String(err?.message ?? err),
            )
          } finally {
            setBusy(false)
            setJoining(false)
          }
        }}
      >
        <label>
          Ton pseudo (ou nom d'équipe)
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus required />
        </label>
        {session.hasPassword && (
          <label>
            🔒 Mot de passe de la session
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || !name.trim()}>
          Rejoindre
        </button>
      </form>
    </div>
  )
}

function PlayerGame({ session, me }: { session: Session; me: Participant }) {
  const participants = useCol<Participant>(collection(db, 'sessions', session.id, 'participants'), `p-${session.id}`) ?? []
  const round = session.round
  const block = session.block
  const answer = useDoc<Answer>(round ? doc(db, 'sessions', session.id, 'answers', `${round.seq}_${me.id}`) : null, [round?.seq])
  const now = useServerClock()
  const [error, setError] = useState('')

  const slowed = !!block?.slowed?.includes(me.id)
  const left = round ? remaining(round.startedAt, round.duration, now, slowed ? TORTUE_FACTOR : 1) : 0
  const mod = round ? getModule(round.module) : null
  const canAnswer = !!(mod && block && (!mod.canAnswer || mod.canAnswer(block, me.id)))
  const locked = !round || round.status !== 'answering' || !round.startedAt || left <= 0 || !canAnswer

  const submit = async (data: Record<string, any>) => {
    if (!round || locked) return
    setError('')
    try {
      await setDoc(doc(db, 'sessions', session.id, 'answers', `${round.seq}_${me.id}`), {
        seq: round.seq,
        pid: me.id,
        name: me.name,
        at: serverTimestamp(),
        data,
      })
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'Trop tard, la question est fermée !' : String(e?.message ?? e))
    }
  }

  const myResult = round?.status === 'revealed' ? round.results?.[me.id] : undefined

  return (
    <div className="page player">
      <header className="player-head">
        <span className="player-name">{me.name}</span>
        {mod && (
          <span className="muted small">
            {mod.icon} {mod.name}
            {round && ` · ${round.index + 1}/${round.total}`}
          </span>
        )}
        <span className="player-score">{me.score ?? 0} pts</span>
      </header>

      {session.phase === 'play' && round && mod && block ? (
        <main className="player-main">
          {round.status === 'answering' && (
            <>
              <TimerBar left={left} total={round.duration * (slowed ? TORTUE_FACTOR : 1)} />
              {slowed && <p className="small center">🐢 Tortue : tu as 30 % de temps en moins</p>}
            </>
          )}
          {round.status === 'revealed' &&
            (() => {
              const custom = mod.resultBanner?.({ round, block, pid: me.id, pts: myResult?.pts })
              if (custom) return <div className={'result-banner ' + (custom.good ? 'result-good' : 'result-bad')}>{custom.text}</div>
              return (
                <div className={'result-banner ' + (myResult?.pts ? 'result-good' : 'result-bad')}>
                  {myResult ? (myResult.pts > 0 ? `+${myResult.pts} pts` : myResult.pts < 0 ? `${myResult.pts} pts` : '0 pt') : 'Pas de réponse'}
                </div>
              )
            })()}
          {/* key : chaque question repart d'un état vierge (saisie, mises…) */}
          <mod.Player
            key={round.seq}
            session={session}
            round={round}
            block={block}
            me={me}
            answer={answer ?? null}
            submit={submit}
            locked={locked}
            left={left}
          />
          {error && <p className="error center">{error}</p>}
          <AutoNext round={round} now={now} />
          {/* Correction collective : les réponses de chacun et les verdicts de l'animateur, en direct */}
          {(round.status === 'validating' || round.status === 'revealed') && <ReviewList round={round} />}
          {round.status === 'revealed' && !round.review?.length && (
            <details className="everyone" open>
              <summary>Les réponses de chacun</summary>
              <RevealList round={round} names={Object.fromEntries(participants.map((p) => [p.id, p.name]))} />
            </details>
          )}
        </main>
      ) : session.phase === 'intro' ? (
        <main className="player-main">
          <GameIntro session={session} compact />
        </main>
      ) : session.phase === 'cards' ? (
        <CardsPicker session={session} me={me} participants={participants} />
      ) : session.phase === 'blockResults' && block ? (
        <MyBlockResult session={session} participants={participants} me={me.id} />
      ) : session.phase === 'final' || session.status === 'done' ? (
        <main className="player-main">
          <h2 className="center">🏁 Classement final</h2>
          <Podium participants={participants} />
          <Leaderboard participants={participants} highlight={me.id} />
        </main>
      ) : (
        <main className="player-main center">
          <div className="huge pulse">🌱</div>
          <p>
            {session.phase === 'lobby' ? 'Tu es dans la partie ! On attend le lancement…' : "L'animateur prépare le prochain jeu…"}
          </p>
          <Leaderboard participants={participants} highlight={me.id} compact />
        </main>
      )}
    </div>
  )
}
