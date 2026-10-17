import { useEffect, useState, type ReactNode } from 'react'
import { looksRight, normalize } from '../lib/normalize'
import type { Answer, Round } from '../types'
import type { ScoreContext, ValidationItem } from './types'

export const CHOICE_COLORS = ['#e4572e', '#2e86de', '#f0a202', '#3bb273']
export const CHOICE_SHAPES = ['▲', '◆', '●', '■']

/** "5,3,1" → [5,3,1] */
export function parsePoints(s: unknown, fallback = [5, 3, 1]): number[] {
  const arr = String(s ?? '')
    .split(/[,; ]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
  return arr.length ? arr : fallback
}

/**
 * Classement avec ex-aequo : les joueurs à égalité ont le même rang et les mêmes points.
 * `entries` doit être trié du meilleur au moins bon.
 */
export function podium<T extends { pid: string }>(
  entries: T[],
  pts: number[],
  same: (a: T, b: T) => boolean,
): Array<T & { rank: number; pts: number }> {
  const out: Array<T & { rank: number; pts: number }> = []
  entries.forEach((e, i) => {
    const prev = out[i - 1]
    const rank = prev && same(entries[i - 1], e) ? prev.rank : i + 1
    out.push({ ...e, rank, pts: pts[rank - 1] ?? 0 })
  })
  return out
}

export function ms(a: Answer): number {
  return a.at?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
}

/** Regroupe les réponses libres identiques pour l'écran de validation */
export function groupFreeAnswers(
  answers: Answer[],
  pick: (a: Answer) => unknown,
  expected: unknown,
  prefix = '',
  group?: string,
): ValidationItem[] {
  const map = new Map<string, ValidationItem>()
  for (const a of answers) {
    const raw = String(pick(a) ?? '').trim()
    const n = normalize(raw)
    if (!n) continue
    const key = prefix + n
    const item = map.get(key)
    if (item) item.count++
    else map.set(key, { key, label: raw, count: 1, suggested: looksRight(raw, expected), group })
  }
  return [...map.values()].sort((a, b) => Number(b.suggested) - Number(a.suggested) || b.count - a.count)
}

/** Verdict pour une réponse libre (clé normalisée) */
export function isValidated(ctx: Pick<ScoreContext, 'verdicts'>, raw: unknown, prefix = ''): boolean {
  const n = normalize(raw)
  return !!n && ctx.verdicts[prefix + n] === true
}

/* ─────────────────────────── Composants partagés ─────────────────────────── */

export function QuestionText({ children, big }: { children: ReactNode; big?: boolean }) {
  return <h2 className={big ? 'q-text q-text-big' : 'q-text'}>{children}</h2>
}

export function Sent({ children }: { children?: ReactNode }) {
  return (
    <div className="sent">
      <div className="sent-check">✓</div>
      <div>{children ?? 'Réponse envoyée'}</div>
      <div className="muted small">Tu peux encore la changer tant que le temps n'est pas écoulé.</div>
    </div>
  )
}

export function Locked({ text = 'Temps écoulé' }: { text?: string }) {
  return <div className="locked">⏱ {text}</div>
}

/** 4 gros boutons colorés (QCM, Gambling, Duo/Carré) */
export function ChoiceButtons({
  choices,
  selected,
  correct,
  disabled,
  onPick,
  show,
  counts,
}: {
  choices: string[]
  selected?: number | null
  correct?: number | null
  disabled?: boolean
  onPick?: (i: number) => void
  /** indices affichés (Duo) */
  show?: number[]
  /** nombre de joueurs par choix (révélation sur l'écran) */
  counts?: number[]
}) {
  return (
    <div className="choices">
      {choices.map((c, i) => {
        if (show && !show.includes(i)) return null
        const isCorrect = correct === i
        const isWrong = correct != null && selected === i && !isCorrect
        return (
          <button
            key={i}
            type="button"
            className={
              'choice' +
              (selected === i ? ' choice-selected' : '') +
              (isCorrect ? ' choice-correct' : '') +
              (isWrong ? ' choice-wrong' : '') +
              (correct != null && !isCorrect ? ' choice-dim' : '')
            }
            style={{ ['--c' as any]: CHOICE_COLORS[i] }}
            disabled={disabled}
            onClick={() => onPick?.(i)}
          >
            <span className="choice-shape">{CHOICE_SHAPES[i]}</span>
            <span>{c}</span>
            {counts && <span className="choice-count">{counts[i] ?? 0}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Champ de réponse libre, envoyé à chaque validation (on peut corriger tant que le temps court) */
export function FreeAnswer({
  initial,
  disabled,
  onSubmit,
  placeholder = 'Ta réponse…',
  label,
  clearOnSubmit,
}: {
  initial?: string
  disabled?: boolean
  onSubmit: (v: string) => Promise<void> | void
  placeholder?: string
  label?: string
  clearOnSubmit?: boolean
}) {
  const [v, setV] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!clearOnSubmit) setV(initial ?? '')
  }, [initial, clearOnSubmit])
  return (
    <form
      className="free-answer"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.trim()) return
        setBusy(true)
        try {
          await onSubmit(v.trim())
          if (clearOnSubmit) setV('')
        } finally {
          setBusy(false)
        }
      }}
    >
      {label && <label className="small muted">{label}</label>}
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="send"
        maxLength={120}
      />
      <button className="btn btn-primary" disabled={disabled || busy || !v.trim()}>
        Envoyer
      </button>
    </form>
  )
}

/** Liste « qui a eu combien » à la révélation (écran) */
export function RevealList({ round, names }: { round: Round; names: Record<string, string> }) {
  const rows = Object.entries(round.results ?? {})
    .filter(([, r]) => r.pts !== 0 || r.detail)
    .sort((a, b) => b[1].pts - a[1].pts)
  if (!rows.length) return <p className="muted">Personne n'a marqué de points.</p>
  return (
    <ul className="reveal-list">
      {rows.map(([pid, r]) => (
        <li key={pid}>
          <span className="reveal-name">{names[pid] ?? '?'}</span>
          {r.detail && <span className="muted small"> {r.detail}</span>}
          <span className={'pts' + (r.pts < 0 ? ' pts-neg' : '')}>{r.pts > 0 ? `+${r.pts}` : r.pts}</span>
        </li>
      ))}
    </ul>
  )
}

export function namesOf(participants: { id: string; name: string }[]): Record<string, string> {
  return Object.fromEntries(participants.map((p) => [p.id, p.name]))
}
