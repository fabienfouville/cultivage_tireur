import { useEffect, useState } from 'react'
import { collection, doc } from 'firebase/firestore'
import { useParams } from 'react-router'
import { BlockResults } from '../components/BlockResults'
import { CardsPlayedCount } from '../components/CardsPicker'
import { ControlPanel } from '../components/ControlPanel'
import { Leaderboard, Podium, ProgressChart, QR, Spinner, TimerBar, playerUrl } from '../components/ui'
import { Wheel } from '../components/Wheel'
import { CARDS, CARD_KEYS } from '../engine/cards'
import { useHost } from '../engine/useHost'
import { db } from '../firebase'
import { ensurePlayerAuth, useIsAdmin } from '../lib/auth'
import { remaining } from '../lib/clock'
import { useCol, useDoc } from '../lib/hooks'
import { getModule } from '../modules'
import { ReviewList } from '../modules/common'
import { AutoNext } from '../components/AutoNext'
import type { Participant, RoundLog, Session } from '../types'

/** Écran projeté (TV / vidéoprojecteur). Public ; si un admin est connecté, il pilote aussi la partie. */
export default function Screen() {
  const { sid = '' } = useParams()
  const session = useDoc<Session>(doc(db, 'sessions', sid))
  const participants = useCol<Participant>(collection(db, 'sessions', sid, 'participants'), `p-${sid}`) ?? []
  const { user, isAdmin } = useIsAdmin()
  const { now } = useHost(session, !!isAdmin, participants)
  const [controlOpen, setControlOpen] = useState(false)
  // Sans compte, l'écran ne peut pas mesurer l'heure du serveur : on ouvre une session anonyme (comme un joueur)
  useEffect(() => {
    if (user === null) ensurePlayerAuth().catch(console.warn)
  }, [user])

  if (session === undefined) return <Spinner />
  if (session === null) return <div className="page center">Session introuvable</div>

  const round = session.round
  const block = session.block
  const mod = round ? getModule(round.module) : block ? getModule(block.module) : null
  const left = round ? remaining(round.startedAt, round.duration, now) : 0
  const url = playerUrl(sid)
  const active = participants.filter((p) => !p.kicked)

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="screen-title">
          🌱 {session.name}
          {mod && (
            <span className="screen-mod">
              {mod.icon} {mod.name}
              {block?.themeName && ` · ${block.themeName}`}
              {round && ` · ${round.index + 1}/${round.total}`}
              {round?.tour && round.tour > 1 ? ` · tour ${round.tour}` : ''}
            </span>
          )}
        </div>
        {session.grandJeu && (
          <div className="muted">
            🏁 {session.grandJeu.name} · module {Math.min(session.grandJeu.step + 1, session.grandJeu.slots.length)}/{session.grandJeu.slots.length}
          </div>
        )}
      </header>

      <div className="screen-body">
        <main className="screen-main">
          {session.phase === 'lobby' || (session.phase === 'pick' && !session.wheel) ? (
            <div className="lobby">
              <QR url={url} size={260} />
              <div>
                <h2>Rejoins la partie !</h2>
                <p className="lobby-url">{url.replace(/^https?:\/\//, '')}</p>
                <p className="muted">ou ouvre {location.host} et choisis « {session.name} »</p>
                <p className="lobby-count">{active.length} joueur{active.length > 1 ? 's' : ''} connecté{active.length > 1 ? 's' : ''}</p>
                {session.phase === 'pick' && <p className="muted">L'animateur choisit le prochain jeu…</p>}
              </div>
            </div>
          ) : session.phase === 'pick' ? (
            <Wheel result={session.wheel?.module} at={session.wheel?.at} />
          ) : session.phase === 'cards' ? (
            <div className="cards-screen">
              <h2>🃏 Phase cartes · {session.cardsUntil ? Math.max(0, Math.ceil((session.cardsUntil.toMillis() - now) / 1000)) : 0}s</h2>
              <div className="cards">
                {CARD_KEYS.map((k) => (
                  <div key={k} className="card-btn">
                    <span className="huge">{CARDS[k].icon}</span>
                    <b>{CARDS[k].name}</b>
                    <span className="small">{CARDS[k].desc}</span>
                  </div>
                ))}
              </div>
              <CardsPlayedCount sid={sid} blockNo={session.blockCount} />
            </div>
          ) : session.phase === 'play' && round && mod && block ? (
            <>
              {round.status === 'answering' && <TimerBar left={left} total={round.duration} />}
              {/* key : chaque question repart d'un affichage vierge */}
              <mod.Screen key={round.seq} session={session} round={round} block={block} participants={participants} left={left} />
              {(round.status === 'validating' || round.status === 'revealed') && <ReviewList round={round} />}
              <AutoNext round={round} now={now} />
              {round.status === 'answering' && (
                <div className="answered">
                  {active.map((p) => (
                    <span key={p.id} className={'answered-chip' + (round.answered?.includes(p.id) ? ' answered-yes' : '')}>
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : session.phase === 'blockResults' && block ? (
            <BlockResults session={session} participants={participants} />
          ) : session.phase === 'final' || session.status === 'done' ? (
            <Final sid={sid} participants={participants} />
          ) : (
            <Spinner label="…" />
          )}
        </main>
        <aside className="screen-side">
          <h3>Classement</h3>
          <Leaderboard participants={participants} compact />
          {session.phase !== 'lobby' && <QR url={url} size={120} />}
        </aside>
      </div>
      {isAdmin && (
        <details className="screen-control" open={controlOpen} onToggle={(e) => setControlOpen((e.target as HTMLDetailsElement).open)}>
          <summary>🎛️ Régie</summary>
          {/* Version écran : sans la bonne réponse, et se referme après chaque action */}
          <ControlPanel session={session} participants={participants} compact onScreen onAction={() => setControlOpen(false)} />
        </details>
      )}
    </div>
  )
}

function Final({ sid, participants }: { sid: string; participants: Participant[] }) {
  const logs = useCol<RoundLog>(collection(db, 'sessions', sid, 'rounds'), `logs-${sid}`) ?? []
  return (
    <div className="final">
      <h2>🏁 Classement final</h2>
      <Podium participants={participants} />
      <ProgressChart logs={logs} participants={participants} />
    </div>
  )
}
