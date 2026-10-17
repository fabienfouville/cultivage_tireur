import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Participant, RoundLog } from '../types'

export function TimerBar({ left, total }: { left: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (left / Math.max(1, total)) * 100))
  const s = Math.max(0, Math.ceil(left))
  return (
    <div className={'timer' + (s <= 5 ? ' timer-urgent' : '')}>
      <div className="timer-bar" style={{ width: `${pct}%` }} />
      <span className="timer-num">{s}s</span>
    </div>
  )
}

export function Leaderboard({
  participants,
  highlight,
  compact,
  extra,
}: {
  participants: Participant[]
  highlight?: string
  compact?: boolean
  extra?: (p: Participant) => ReactNode
}) {
  const rows = ranked(participants)
  return (
    <ol className={'board' + (compact ? ' board-compact' : '')}>
      {rows.map(({ p, rank }) => (
        <li key={p.id} className={p.id === highlight ? 'board-me' : ''}>
          <span className="board-rank">{medal(rank)}</span>
          <span className="board-name">{p.name}</span>
          {extra?.(p)}
          <span className="board-score">{p.score ?? 0}</span>
        </li>
      ))}
      {!rows.length && <li className="muted">Personne pour l'instant</li>}
    </ol>
  )
}

export function ranked(participants: Participant[], score = (p: Participant) => p.score ?? 0) {
  const sorted = participants.filter((p) => !p.kicked).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
  const out: { p: Participant; rank: number }[] = []
  sorted.forEach((p, i) => out.push({ p, rank: i > 0 && score(sorted[i - 1]) === score(p) ? out[i - 1].rank : i + 1 }))
  return out
}

export function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`
}

export function Podium({ participants }: { participants: Participant[] }) {
  const rows = ranked(participants).slice(0, 3)
  const order = [rows[1], rows[0], rows[2]].filter(Boolean)
  return (
    <div className="podium">
      {order.map(({ p, rank }) => (
        <div key={p.id} className={`podium-step podium-${rank}`}>
          <div className="podium-name">{p.name}</div>
          <div className="podium-score">{p.score} pts</div>
          <div className="podium-block">{medal(rank)}</div>
        </div>
      ))}
    </div>
  )
}

export function QR({ url, size = 220 }: { url: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: size }).then(setSrc).catch(console.warn)
  }, [url, size])
  return src ? <img src={src} width={size} height={size} alt={url} className="qr" /> : null
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return <div className="spinner">{label}</div>
}

export function Header({ title, right, back }: { title: ReactNode; right?: ReactNode; back?: string }) {
  return (
    <header className="topbar">
      {back && (
        <Link to={back} className="back" aria-label="Retour">
          ←
        </Link>
      )}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  )
}

/** Graphe « progression cumulée » des scores, en SVG */
export function ProgressChart({ logs, participants }: { logs: RoundLog[]; participants: Participant[] }) {
  const players = participants.filter((p) => !p.kicked)
  const sorted = [...logs].sort((a, b) => ((a.at as any)?.toMillis?.() ?? 0) - ((b.at as any)?.toMillis?.() ?? 0))
  if (sorted.length < 2 || !players.length) return null
  const series = players.map((p) => {
    let acc = 0
    return [0, ...sorted.map((l) => (acc += l.results?.[p.id] ?? 0))]
  })
  const max = Math.max(1, ...series.flat())
  const min = Math.min(0, ...series.flat())
  const W = 600
  const H = 220
  const x = (i: number) => (i / sorted.length) * W
  const y = (v: number) => H - ((v - min) / (max - min)) * H
  const colors = ['#e4572e', '#2e86de', '#f0a202', '#3bb273', '#8e44ad', '#16a085', '#d35400', '#2c3e50', '#c0392b', '#7f8c8d']
  return (
    <figure className="chart">
      <svg viewBox={`-4 -8 ${W + 90} ${H + 16}`} role="img" aria-label="Progression des scores">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.2} />
        {series.map((s, i) => (
          <g key={players[i].id}>
            <polyline
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth={2.5}
              strokeLinejoin="round"
              points={s.map((v, j) => `${x(j)},${y(v)}`).join(' ')}
            />
            <text x={W + 6} y={y(s[s.length - 1]) + 4} fontSize={13} fill={colors[i % colors.length]}>
              {players[i].name}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="muted small">Progression des scores question après question</figcaption>
    </figure>
  )
}

export function playerUrl(sid: string) {
  return `${location.origin}/s/${sid}`
}
