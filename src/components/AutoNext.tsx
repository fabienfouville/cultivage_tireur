import type { Round } from '../types'

/** « Question suivante dans X s » (écran et téléphones) */
export function AutoNext({ round, now }: { round: Round; now: number }) {
  if (round.status !== 'revealed' || !round.autoNextAt) return null
  const left = Math.max(0, Math.ceil((round.autoNextAt.toMillis() - now) / 1000))
  return <p className="auto-next-banner">Suite dans {left} s</p>
}
