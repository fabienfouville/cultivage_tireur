import { collection, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import { useCol } from '../lib/hooks'
import { getModule } from '../modules'
import type { Participant, RoundLog, Session } from '../types'
import { medal, ranked } from './ui'

/** Points gagnés par chacun sur le module (bloc) en cours */
function useBlockTotals(session: Session) {
  const block = session.block!
  const logs =
    useCol<RoundLog>(
      query(collection(db, 'sessions', session.id, 'rounds'), where('blockNo', '==', block.no)),
      `logs-${session.id}-${block.no}`,
      [block.no],
    ) ?? []
  const totals: Record<string, number> = {}
  for (const l of logs) for (const [pid, pts] of Object.entries(l.results ?? {})) totals[pid] = (totals[pid] ?? 0) + pts
  return totals
}

/**
 * Marches du podium d'une manche : les 3 premiers rangs (ex aequo sur la même marche), seulement ceux qui ont marqué.
 * Dans l'ordre d'affichage : 2e à gauche, 1er au centre, 3e à droite.
 */
export function podiumSteps(participants: Participant[], totals: Record<string, number>) {
  const rows = ranked(participants, (p) => totals[p.id] ?? 0).filter((r) => (totals[r.p.id] ?? 0) > 0)
  const ranks = [...new Set(rows.map((r) => r.rank))].filter((r) => r <= 3).slice(0, 3)
  const steps = ranks.map((rank, place) => ({
    place: place + 1,
    rank,
    names: rows.filter((r) => r.rank === rank).map((r) => r.p.name),
    pts: totals[rows.find((r) => r.rank === rank)!.p.id] ?? 0,
  }))
  return [steps[1], steps[0], steps[2]].filter(Boolean)
}

/** Ordre d'entrée en scène : le 3e d'abord, le 1er en dernier (en ms) */
const ENTRY = { 3: 700, 2: 2100, 1: 3900 } as Record<number, number>

/** Fin de manche sur l'écran projeté : podium animé des 3 premiers de la manche */
export function BlockResults({ session, participants }: { session: Session; participants: Participant[] }) {
  const block = session.block!
  const totals = useBlockTotals(session)
  const mod = getModule(block.module)
  const steps = podiumSteps(participants, totals)
  return (
    // La clé rejoue l'animation à chaque nouvelle manche
    <main className="manche" key={block.no}>
      <Confetti delay={ENTRY[1] + 500} />
      <h2 className="manche-title">
        <span className="manche-icon">{mod.icon}</span> Fin de la manche
        <small>
          {mod.name} — {block.themeName}
        </small>
      </h2>
      {steps.length ? (
        <div className="manche-podium">
          {steps.map((s) => (
            <div key={s.place} className={`manche-step manche-step-${s.place}`} style={{ ['--d' as string]: `${ENTRY[s.place]}ms` }}>
              <div className="manche-who">
                <div className="manche-medal">{medal(s.rank)}</div>
                <div className="manche-name">{s.names.join(' · ')}</div>
                <div className="manche-pts">
                  +<CountUp to={s.pts} delay={ENTRY[s.place] + 400} /> {s.pts > 1 ? 'pts' : 'pt'}
                </div>
              </div>
              <div className="manche-block">{s.rank}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="manche-empty">Personne n'a marqué sur cette manche 😅</p>
      )}
    </main>
  )
}

/** Fin de manche sur le téléphone : seulement mon score et ma place */
export function MyBlockResult({ session, participants, me }: { session: Session; participants: Participant[]; me: string }) {
  const block = session.block!
  const totals = useBlockTotals(session)
  const mod = getModule(block.module)
  const inBlock = ranked(participants, (p) => totals[p.id] ?? 0)
  const overall = ranked(participants)
  const mine = inBlock.find((r) => r.p.id === me)
  const mineAll = overall.find((r) => r.p.id === me)
  const pts = totals[me] ?? 0
  return (
    <main className="player-main my-result" key={block.no}>
      <p className="muted center">
        {mod.icon} Fin de la manche · {mod.name}
      </p>
      {mine && (
        <div className="my-result-card">
          <div className="my-result-rank">{mine.rank <= 3 && pts > 0 ? medal(mine.rank) : `${mine.rank}e`}</div>
          <div>
            {mine.rank === 1 ? '1er' : `${mine.rank}e`} sur {inBlock.length} sur cette manche
          </div>
          <div className="my-result-pts">
            {pts >= 0 ? '+' : ''}
            {pts} {Math.abs(pts) > 1 ? 'pts' : 'pt'}
          </div>
        </div>
      )}
      {mineAll && (
        <p className="center my-result-all">
          Classement général : <b>{mineAll.rank === 1 ? '1er' : `${mineAll.rank}e`}</b> sur {overall.length} · <b>{mineAll.p.score ?? 0} pts</b>
        </p>
      )}
      <p className="muted small center">Regarde l'écran pour le podium !</p>
    </main>
  )
}

/** Nombre qui défile de 0 jusqu'à `to` */
function CountUp({ to, delay = 0, ms = 900 }: { to: number; delay?: number; ms?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now() + delay
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / ms))
      setV(Math.round(to * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, delay, ms])
  return <>{v}</>
}

const COLORS = ['#f0a202', '#e4572e', '#3bb273', '#2e86de', '#9b59b6', '#ffffff']
/** Pluie de confettis (CSS seulement), une fois */
function Confetti({ delay }: { delay: number }) {
  const [bits] = useState(() =>
    Array.from({ length: 90 }, (_, i) => ({
      left: Math.random() * 100,
      color: COLORS[i % COLORS.length],
      d: delay + Math.random() * 900,
      dur: 2200 + Math.random() * 1800,
      drift: (Math.random() - 0.5) * 30,
      size: 6 + Math.random() * 8,
      round: Math.random() < 0.3,
    })),
  )
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: `${b.left}%`,
            background: b.color,
            width: b.size,
            height: b.round ? b.size : b.size * 0.45,
            borderRadius: b.round ? '50%' : 2,
            animationDelay: `${b.d}ms`,
            animationDuration: `${b.dur}ms`,
            ['--drift' as string]: `${b.drift}vw`,
          }}
        />
      ))}
    </div>
  )
}
