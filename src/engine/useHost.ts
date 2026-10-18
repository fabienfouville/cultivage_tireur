import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useRef, useState } from 'react'
import { db } from '../firebase'
import { remaining, useServerClock } from '../lib/clock'
import { useDoc } from '../lib/hooks'
import { getModule } from '../modules'
import type { Answer, Participant, Session } from '../types'
import { GENERAL_DEFAULTS, closeRound, endCardsPhase, markAnswered, next, type GeneralConfig } from './engine'

/**
 * À monter sur chaque appareil admin qui suit une session (régie, écran connecté en admin).
 * - écoute les réponses de la question en cours,
 * - met à jour « qui a répondu »,
 * - ferme la question quand le temps est écoulé ou quand tout le monde a répondu,
 * - passe à la question suivante quelques secondes après la révélation,
 * - termine la phase cartes à l'heure.
 * Plusieurs appareils peuvent le faire en même temps sans risque (transitions protégées).
 */
export function useHost(session: Session | null | undefined, enabled: boolean, participants: Participant[] = []) {
  const sid = session?.id
  const seq = session?.round?.seq
  const [answers, setAnswers] = useState<Answer[]>([])
  const now = useServerClock(500)
  const busy = useRef<string | null>(null)
  const stored = useDoc<Partial<GeneralConfig>>(enabled ? doc(db, 'config', 'general') : null)
  const general: GeneralConfig = { ...GENERAL_DEFAULTS, ...(stored ?? {}) }

  useEffect(() => {
    if (!enabled || !sid || seq == null) {
      setAnswers([])
      return
    }
    return onSnapshot(query(collection(db, 'sessions', sid, 'answers'), where('seq', '==', seq)), (snap) =>
      setAnswers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Answer)),
    )
  }, [enabled, sid, seq])

  /** Une seule exécution par clé (évite de relancer la même transition à chaque rendu) */
  const once = (key: string, fn: () => Promise<unknown>) => {
    if (busy.current === key) return
    busy.current = key
    fn().catch((e) => {
      console.warn(e)
      busy.current = null
    })
  }

  // Qui a répondu
  const answered = session?.round?.answered ?? []
  const missing = answers.map((a) => a.pid).filter((pid) => !answered.includes(pid))
  useEffect(() => {
    if (!enabled || !sid || seq == null || !missing.length) return
    const t = setTimeout(() => void markAnswered(sid, seq, missing).catch(console.warn), 300)
    return () => clearTimeout(t)
  }, [enabled, sid, seq, missing.join(',')])

  const round = session?.round
  const block = session?.block
  const answering = round?.status === 'answering' && !!round.startedAt

  // Fin du temps
  const timeUp = answering && remaining(round!.startedAt, round!.duration, now) < -0.5

  // Tout le monde a répondu (sauf jeux à réponses multiples, comme Thème)
  let everyone = false
  if (answering && general.autoClose && block && seq != null) {
    const mod = getModule(round!.module)
    const expected = participants.filter((p) => !p.kicked && (!mod.canAnswer || mod.canAnswer(block, p.id)))
    const done = new Set(answers.filter((a) => !mod.isComplete || mod.isComplete(a.data)).map((a) => a.pid))
    everyone = !mod.multiAnswer && expected.length > 0 && expected.every((p) => done.has(p.id))
  }

  useEffect(() => {
    if (!enabled || !sid || seq == null || !(timeUp || everyone)) return
    // Petit délai quand tout le monde a répondu, pour laisser voir la dernière réponse arriver
    const t = setTimeout(() => once(`close-${seq}`, () => closeRound(sid, seq)), timeUp ? 0 : 1200)
    return () => clearTimeout(t)
  }, [enabled, sid, seq, timeUp, everyone])

  // Question suivante automatique après la révélation
  const autoNextDue = round?.status === 'revealed' && !!round.autoNextAt && round.autoNextAt.toMillis() <= now
  useEffect(() => {
    if (!enabled || !sid || seq == null || !autoNextDue) return
    once(`next-${seq}`, () => next(sid, seq))
  }, [enabled, sid, seq, autoNextDue])

  // Fin de la phase cartes
  const cardsOver = session?.phase === 'cards' && session.cardsUntil && session.cardsUntil.toMillis() < now
  useEffect(() => {
    if (!enabled || !sid || !cardsOver) return
    once(`cards-${session?.blockCount}`, () => endCardsPhase(sid))
  }, [enabled, sid, cardsOver])

  return { answers, now, general }
}
