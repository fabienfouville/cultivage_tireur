import { useEffect, useState } from 'react'
import { getModule } from '../modules'
import type { Session } from '../types'
import { Wheel } from './Wheel'

/** Durée de la roue avant d'afficher les règles (ms) */
const SPIN_MS = 5400

/**
 * Grand Jeu : annonce du jeu suivant. La roue fait semblant de tirer au sort et s'arrête sur le jeu prévu,
 * puis on affiche ses règles, le nombre de questions et le temps, le temps que l'animateur les explique.
 */
export function GameIntro({ session, compact }: { session: Session; compact?: boolean }) {
  const gj = session.grandJeu
  const slot = gj?.slots[gj.step]
  const at = session.introAt ?? 0
  const [now, setNow] = useState(Date.now())
  const spinning = now - at < SPIN_MS
  useEffect(() => {
    if (!spinning) return
    const t = setTimeout(() => setNow(Date.now()), Math.max(50, at + SPIN_MS - Date.now()))
    return () => clearTimeout(t)
  }, [at, spinning])
  if (!gj || !slot) return null
  const mod = getModule(slot.module)
  return (
    <div className={'game-intro' + (compact ? ' game-intro-compact' : '')}>
      <p className="game-intro-step">
        Jeu {gj.step + 1} / {gj.slots.length}
      </p>
      <Wheel result={slot.module} at={at} />
      {!spinning && (
        <div className="game-intro-rules">
          <p>{mod.rules}</p>
          <p className="muted">
            {slot.questionCount} question{slot.questionCount > 1 ? 's' : ''}
            {slot.extraThemeId && ` + ${slot.extraCount ?? 1} bonus « ${slot.extraThemeName} »`} · {slot.timer} s par question
          </p>
          <p className="muted small">L'animateur lance le jeu dans un instant…</p>
        </div>
      )}
    </div>
  )
}
