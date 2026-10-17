import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useState } from 'react'
import { CARDS, CARD_KEYS } from '../engine/cards'
import { db } from '../firebase'
import { useServerClock } from '../lib/clock'
import { useCol, useDoc } from '../lib/hooks'
import { getModule } from '../modules'
import type { CardKey, Participant, Session } from '../types'

/** Phase cartes du Grand Jeu, côté joueur : une carte par phase, chaque carte une seule fois dans la partie */
export function CardsPicker({ session, me, participants }: { session: Session; me: Participant; participants: Participant[] }) {
  const cid = `${session.blockCount}_${me.id}`
  const playedDoc = useDoc<{ card: CardKey | null; target?: string }>(doc(db, 'sessions', session.id, 'cardPlays', cid), [cid])
  const played = playedDoc?.card ? (playedDoc as { card: CardKey; target?: string }) : null
  const [card, setCard] = useState<CardKey | null>(null)
  const [error, setError] = useState('')
  const now = useServerClock()
  const left = session.cardsUntil ? Math.max(0, Math.ceil((session.cardsUntil.toMillis() - now) / 1000)) : 0
  const slot = session.grandJeu?.slots[session.grandJeu.step]
  const others = participants.filter((p) => p.id !== me.id && !p.kicked)

  const play = async (c: CardKey, target?: string) => {
    setError('')
    try {
      await setDoc(doc(db, 'sessions', session.id, 'cardPlays', cid), {
        pid: me.id,
        blockNo: session.blockCount,
        card: c,
        target: target ?? null,
        at: serverTimestamp(),
      })
      setCard(null)
    } catch (e: any) {
      setError(e?.code === 'permission-denied' ? 'Trop tard !' : String(e?.message ?? e))
    }
  }

  return (
    <main className="player-main cards-phase">
      <h2 className="center">🃏 Phase cartes · {left}s</h2>
      {slot && (
        <p className="center muted">
          Prochain module : {getModule(slot.module).icon} {getModule(slot.module).name} — {slot.themeName}
        </p>
      )}
      {played ? (
        <div className="sent">
          <div className="huge">{CARDS[played.card].icon}</div>
          Tu joues <b>{CARDS[played.card].name}</b>
          {played.target && <> contre {participants.find((p) => p.id === played.target)?.name}</>}
          <button className="btn btn-small" onClick={() => setDoc(doc(db, 'sessions', session.id, 'cardPlays', cid), { pid: me.id, blockNo: session.blockCount, card: null, target: null }).catch(() => {})}>
            Annuler
          </button>
        </div>
      ) : (
        <div className="cards">
          {CARD_KEYS.map((k) => {
            const used = me.usedCards?.includes(k)
            return (
              <button key={k} className={'card-btn' + (card === k ? ' card-selected' : '')} disabled={used} onClick={() => (CARDS[k].needsTarget ? setCard(k) : play(k))}>
                <span className="huge">{CARDS[k].icon}</span>
                <b>{CARDS[k].name}</b>
                <span className="small">{used ? 'déjà utilisée' : CARDS[k].desc}</span>
              </button>
            )
          })}
        </div>
      )}
      {card && !played && (
        <div className="card">
          <p>Contre qui ?</p>
          <div className="targets">
            {others.map((p) => (
              <button key={p.id} className="btn" onClick={() => play(card, p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="muted small center">Tu peux aussi ne rien jouer et garder tes cartes pour plus tard.</p>
      {error && <p className="error center">{error}</p>}
      <CardsPlayedCount sid={session.id} blockNo={session.blockCount} />
    </main>
  )
}

export function CardsPlayedCount({ sid, blockNo }: { sid: string; blockNo: number }) {
  const plays = useCol<{ id: string; card: CardKey | null; pid: string }>(collection(db, 'sessions', sid, 'cardPlays'), `cards-${sid}`) ?? []
  const n = plays.filter((p) => p.card && p.id.startsWith(`${blockNo}_`)).length
  return <p className="center small">{n} carte{n > 1 ? 's' : ''} jouée{n > 1 ? 's' : ''}</p>
}
