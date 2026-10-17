import { collection, query, where } from 'firebase/firestore'
import { CARDS } from '../engine/cards'
import { db } from '../firebase'
import { useCol } from '../lib/hooks'
import { getModule } from '../modules'
import type { Participant, RoundLog, Session } from '../types'
import { Leaderboard, medal, ranked } from './ui'

/** Résultats d'un module (bloc) : points gagnés sur le module, effets des cartes, puis classement général */
export function BlockResults({ session, participants, highlight }: { session: Session; participants: Participant[]; highlight?: string }) {
  const block = session.block!
  const logs =
    useCol<RoundLog & { details?: Record<string, string> }>(
      query(collection(db, 'sessions', session.id, 'rounds'), where('blockNo', '==', block.no)),
      `logs-${session.id}-${block.no}`,
      [block.no],
    ) ?? []
  const totals: Record<string, number> = {}
  const cardDetails: Record<string, string> = {}
  for (const l of logs) {
    for (const [pid, pts] of Object.entries(l.results ?? {})) totals[pid] = (totals[pid] ?? 0) + pts
    if (l.kind === 'cards') Object.assign(cardDetails, l.details ?? {})
  }
  const mod = getModule(block.module)
  const rows = ranked(participants, (p) => totals[p.id] ?? 0)
  return (
    <main className="block-results">
      <h2>
        {mod.icon} {mod.name} — {block.themeName}
      </h2>
      <ol className="board">
        {rows.map(({ p, rank }) => (
          <li key={p.id} className={p.id === highlight ? 'board-me' : ''}>
            <span className="board-rank">{medal(rank)}</span>
            <span className="board-name">
              {p.name}
              {cardDetails[p.id] && <span className="muted small"> {cardDetails[p.id]}</span>}
              {block.cards?.[p.id] && !cardDetails[p.id] && (
                <span className="muted small">
                  {' '}
                  {CARDS[block.cards[p.id].card].icon} {CARDS[block.cards[p.id].card].name}
                  {block.cards[p.id].target && ` → ${participants.find((x) => x.id === block.cards![p.id].target)?.name ?? '?'}`}
                </span>
              )}
            </span>
            <span className="board-score">{(totals[p.id] ?? 0) >= 0 ? '+' : ''}{totals[p.id] ?? 0}</span>
          </li>
        ))}
      </ol>
      <h3>Classement général</h3>
      <Leaderboard participants={participants} highlight={highlight} compact />
    </main>
  )
}
