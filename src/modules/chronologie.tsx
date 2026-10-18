import { useState } from 'react'
import { Locked, QuestionText, RevealList, Sent, namesOf } from './common'
import type { ModuleDef } from './types'

const eventsOf = (q: Record<string, unknown>): string[] =>
  (Array.isArray(q.events) ? (q.events as string[]) : []).map((e) => String(e).trim()).filter(Boolean)
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  // Jamais déjà dans le bon ordre
  return a.length > 1 && a.every((x, i) => x === arr[i]) ? [...a.slice(1), a[0]] : a
}
/** Nombre d'événements à la bonne place */
export const wellPlaced = (given: unknown, events: string[]) =>
  Array.isArray(given) ? events.filter((e, i) => given[i] === e).length : 0

export const chronologie: ModuleDef = {
  key: 'chronologie',
  name: 'Chronologie',
  icon: '📅',
  tagline: 'Remettre des événements dans l’ordre',
  rules: 'Touche les événements du plus ancien au plus récent. Un point par événement bien placé, un bonus si tout est juste.',
  defaults: { timer: 40, perItem: 1, perfect: 3 },
  configFields: [
    { key: 'perItem', label: 'Points par événement bien placé', type: 'number' },
    { key: 'perfect', label: 'Bonus si tout est dans le bon ordre', type: 'number' },
  ],
  questionFields: [
    { key: 'text', label: 'Consigne (ex. Du plus ancien au plus récent)', type: 'text' },
    { key: 'events', label: 'Événements, un par ligne, du plus ancien au plus récent', type: 'list' },
    { key: 'dates', label: 'Dates affichées à la révélation, une par ligne, dans le même ordre', type: 'list', optional: true },
  ],
  summary: (q) => eventsOf(q).join(' → '),
  publicPayload: (q) => ({ text: q.text || 'Du plus ancien au plus récent', items: shuffle(eventsOf(q)) }),
  solution: (q) => ({ events: eventsOf(q), dates: Array.isArray(q.dates) ? q.dates : [] }),
  isComplete: (d) => Array.isArray(d.order) && d.order.length >= 2,
  describe: (d) => (Array.isArray(d.order) ? d.order.join(' → ') : ''),
  score: ({ q, answers, cfg }) => {
    const events = eventsOf(q)
    const results: Record<string, { pts: number; detail?: string }> = {}
    let perfect = 0
    for (const a of answers) {
      const n = wellPlaced(a.data.order, events)
      const all = n === events.length
      if (all) perfect++
      results[a.pid] = {
        pts: n * Number(cfg.perItem ?? 1) + (all ? Number(cfg.perfect ?? 0) : 0),
        detail: all ? '🎯 tout juste' : `${n}/${events.length} bien placé${n > 1 ? 's' : ''}`,
      }
    }
    return { results, summary: { perfect } }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const items: string[] = round.public.items ?? []
    const [picked, setPicked] = useState<string[]>(answer?.data.order ?? [])
    const revealed = round.status === 'revealed'
    if (revealed) {
      const events: string[] = round.solution?.events ?? []
      const mine: string[] = answer?.data.order ?? []
      return (
        <>
          <QuestionText>{round.public.text}</QuestionText>
          <ChronoList events={events} dates={round.solution?.dates} marks={mine.length ? events.map((e, i) => mine[i] === e) : undefined} />
          {answer && <p className="center">{round.results?.[me.id]?.detail}</p>}
        </>
      )
    }
    const tap = (item: string) => {
      if (locked) return
      const next = picked.includes(item) ? picked.slice(0, picked.indexOf(item)) : [...picked, item]
      setPicked(next)
      if (next.length === items.length) void submit({ order: next })
    }
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <p className="muted small center">Touche du plus ancien au plus récent. Touche un numéro pour reprendre à partir de là.</p>
        <div className="chrono-pick">
          {items.map((item) => {
            const rank = picked.indexOf(item)
            return (
              <button key={item} className={'chrono-item' + (rank >= 0 ? ' chrono-on' : '')} disabled={locked} onClick={() => tap(item)}>
                <span className="chrono-rank">{rank >= 0 ? rank + 1 : '·'}</span>
                {item}
              </button>
            )
          })}
        </div>
        {answer && picked.length === items.length && !locked && <Sent>Ordre envoyé, tu peux encore le changer</Sent>}
        {locked && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => {
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText big>{round.public.text}</QuestionText>
        {revealed ? (
          <>
            <ChronoList events={round.solution?.events ?? []} dates={round.solution?.dates} />
            <RevealList round={round} names={namesOf(participants)} />
          </>
        ) : (
          <ul className="chrono-list">
            {(round.public.items ?? []).map((e: string) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </>
    )
  },
}

function ChronoList({ events, dates, marks }: { events: string[]; dates?: string[]; marks?: boolean[] }) {
  return (
    <ol className="chrono-list">
      {events.map((e, i) => (
        <li key={e}>
          {dates?.[i] && <b className="chrono-date">{dates[i]}</b>} {e} {marks && (marks[i] ? '✅' : '❌')}
        </li>
      ))}
    </ol>
  )
}
