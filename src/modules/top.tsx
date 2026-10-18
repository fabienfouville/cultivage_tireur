import { looksRight, normalize } from '../lib/normalize'
import { FreeAnswer, Locked, QuestionText, RevealList, Sent, namesOf } from './common'
import type { ModuleDef, ValidationItem } from './types'

type Found = Record<string, { label: string; by: string[]; tour: number }>
const items = (q: Record<string, unknown>) => ((q.answers as string[]) ?? []).map((s) => String(s).trim())

function TopBoard({ n, found, solution }: { n: number; found: Found; solution?: string[] }) {
  return (
    <ol className="top-board">
      {Array.from({ length: n }, (_, i) => {
        const f = found[i]
        return (
          <li key={i} className={f ? 'top-found' : solution ? 'top-missed' : ''}>
            <span className="top-rank">#{i + 1}</span>
            <span>{f?.label ?? solution?.[i] ?? '???'}</span>
            <span className="muted small">{n - i} pt{n - i > 1 ? 's' : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

export const top: ModuleDef = {
  key: 'top',
  name: 'Le Top',
  icon: '🏆',
  tagline: 'Classement à deviner',
  rules:
    'Un classement est à deviner. À chaque tour, propose un élément : s’il est dans le classement, il est révélé et tu gagnes des points (plus il est haut… moins il rapporte : n − rang + 1).',
  defaults: { timer: 20 },
  configFields: [],
  questionFields: [
    { key: 'text', label: 'Le classement', type: 'text', placeholder: 'Top 5 des pays les plus peuplés' },
    { key: 'answers', label: 'Éléments dans l’ordre (n°1 en premier)', type: 'list', placeholder: 'Un élément par ligne' },
  ],
  manual: true,
  multiTour: true,
  summary: (q) => items(q).join(' > '),
  publicPayload: (q) => ({ text: q.text, n: items(q).length }),
  solution: (q) => ({ list: items(q), label: items(q).join(' > ') }),
  validationItems: ({ q, answers, round }) => {
    const list = items(q)
    const found: Found = round.state?.found ?? {}
    const map = new Map<string, ValidationItem>()
    for (const a of answers) {
      const raw = String(a.data.text ?? '').trim()
      const n = normalize(raw)
      if (!n) continue
      // On propose le rang qui ressemble le plus ; l'animateur peut décocher
      const rank = list.findIndex((it, i) => !found[i] && looksRight(raw, it))
      const already = list.findIndex((it, i) => found[i] && looksRight(raw, it))
      const key = `${rank}|${n}`
      const label =
        rank >= 0 ? `${raw} → #${rank + 1} ${list[rank]}` : already >= 0 ? `${raw} (déjà trouvé : #${already + 1})` : `${raw} → pas dans le top ?`
      const it = map.get(key)
      if (it) {
        it.count++
        it.pids!.push(a.pid)
      } else map.set(key, { key, label, count: 1, pids: [a.pid], suggested: rank >= 0 })
      // Toutes les autres places possibles, pour corriger à la main
      if (rank < 0) {
        list.forEach((li, i) => {
          if (found[i]) return
          const k = `${i}|${n}`
          if (!map.has(k)) map.set(k, { key: k, label: `${raw} = #${i + 1} ${li} ?`, count: 0, suggested: false, group: 'Corriger à la main' })
        })
      }
    }
    return [...map.values()]
  },
  score: ({ q, answers, verdicts, round }) => {
    const list = items(q)
    const n = list.length
    const found: Found = { ...(round.state?.found ?? {}) }
    const results: Record<string, { pts: number; detail?: string }> = {}
    const tour = round.tour ?? 1
    for (const a of answers) {
      const g = normalize(a.data.text)
      if (!g) continue
      const rank = list.findIndex((_, i) => verdicts[`${i}|${g}`] === true)
      if (rank >= 0 && (!found[rank] || found[rank].tour === tour)) {
        found[rank] = { label: list[rank], by: [...(found[rank]?.by ?? []), a.pid], tour }
        results[a.pid] = { pts: n - rank, detail: `« ${a.data.text} » #${rank + 1} ✅` }
      } else {
        results[a.pid] = { pts: 0, detail: `« ${a.data.text} » ❌` }
      }
    }
    return { results, state: { found } }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const found: Found = round.state?.found ?? {}
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <p className="muted center small">
          Tour {round.tour ?? 1} · une seule proposition par tour, elle ne peut plus être changée
        </p>
        {round.status === 'answering' &&
          (answer ? (
            <Sent final>Ta proposition pour ce tour : « {answer.data.text} »</Sent>
          ) : locked ? (
            <Locked />
          ) : (
            <FreeAnswer disabled={locked} placeholder="Un élément du classement…" onSubmit={(text) => submit({ text })} />
          ))}
        {revealed && round.results?.[me.id] && <p className="center">{round.results[me.id].detail}</p>}
        <TopBoard
          n={round.public.n}
          found={found}
          solution={round.solution?.list && round.state?.ended ? round.solution.list : undefined}
        />
      </>
    )
  },
  Screen: ({ round, participants }) => {
    const found: Found = round.state?.found ?? {}
    const allFound = Object.keys(found).length >= round.public.n
    return (
      <div className="top-screen">
        <div>
          <QuestionText big>{round.public.text}</QuestionText>
          <p className="muted">Tour {round.tour ?? 1}</p>
          {round.status === 'revealed' && !round.review?.length && <RevealList round={round} names={namesOf(participants)} />}
        </div>
        <TopBoard n={round.public.n} found={found} solution={round.solution?.list && (allFound || round.state?.ended) ? round.solution.list : undefined} />
      </div>
    )
  },
}
