import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useRef, useState } from 'react'
import { db } from '../firebase'
import { remaining, useServerClock } from '../lib/clock'
import type { Answer, Session } from '../types'
import { closeRound, endCardsPhase, markAnswered } from './engine'

/**
 * À monter sur chaque appareil admin qui suit une session (régie, écran connecté en admin).
 * - écoute les réponses de la question en cours,
 * - met à jour « qui a répondu »,
 * - ferme la question quand le temps est écoulé, termine la phase cartes à l'heure.
 * Plusieurs appareils peuvent le faire en même temps sans risque (transitions protégées).
 */
export function useHost(session: Session | null | undefined, enabled: boolean) {
  const sid = session?.id
  const seq = session?.round?.seq
  const [answers, setAnswers] = useState<Answer[]>([])
  const now = useServerClock(500)
  const busy = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !sid || seq == null) {
      setAnswers([])
      return
    }
    return onSnapshot(query(collection(db, 'sessions', sid, 'answers'), where('seq', '==', seq)), (snap) =>
      setAnswers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Answer)),
    )
  }, [enabled, sid, seq])

  // Qui a répondu
  const answered = session?.round?.answered ?? []
  const missing = answers.map((a) => a.pid).filter((pid) => !answered.includes(pid))
  useEffect(() => {
    if (!enabled || !sid || seq == null || !missing.length) return
    const t = setTimeout(() => void markAnswered(sid, seq, missing).catch(console.warn), 300)
    return () => clearTimeout(t)
  }, [enabled, sid, seq, missing.join(',')])

  // Fin du temps
  const round = session?.round
  const timeUp = round?.status === 'answering' && round.startedAt && remaining(round.startedAt, round.duration, now) < -0.5
  useEffect(() => {
    if (!enabled || !sid || !timeUp || seq == null) return
    const key = `close-${seq}`
    if (busy.current === key) return
    busy.current = key
    closeRound(sid, seq).catch((e) => {
      console.warn(e)
      busy.current = null
    })
  }, [enabled, sid, seq, timeUp])

  // Fin de la phase cartes
  const cardsOver = session?.phase === 'cards' && session.cardsUntil && session.cardsUntil.toMillis() < now
  useEffect(() => {
    if (!enabled || !sid || !cardsOver) return
    const key = `cards-${session?.blockCount}`
    if (busy.current === key) return
    busy.current = key
    endCardsPhase(sid).catch((e) => {
      console.warn(e)
      busy.current = null
    })
  }, [enabled, sid, cardsOver])

  return { answers, now }
}
