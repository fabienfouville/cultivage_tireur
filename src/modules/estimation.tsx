import { useState } from 'react'
import { Locked, QuestionText, RevealList, Sent, namesOf, ms, parsePoints, podium } from './common'
import type { ModuleDef } from './types'

const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : String(n ?? '?'))

/** Saisie lisible : « 1234567,5 » s'affiche « 1 234 567,5 » pendant la frappe */
export function formatTyping(raw: string): string {
  const neg = raw.trim().startsWith('-') ? '-' : ''
  const cleaned = raw.replace(/[^\d,.]/g, '')
  const sep = cleaned.search(/[,.]/)
  const int = (sep < 0 ? cleaned : cleaned.slice(0, sep)).replace(/\D/g, '')
  const dec = sep < 0 ? null : cleaned.slice(sep + 1).replace(/\D/g, '')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return neg + grouped + (dec != null ? ',' + dec : '')
}
export const parseTyping = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'))

export const estimation: ModuleDef = {
  key: 'estimation',
  name: 'Estimation',
  icon: '🎯',
  tagline: 'Le plus proche gagne',
  rules: 'Donne un nombre. Les plus proches de la bonne réponse gagnent (podium).',
  defaults: { timer: 30, podium: '5,3,1' },
  configFields: [{ key: 'podium', label: 'Points du podium', type: 'text', help: 'ex : 5,3,1' }],
  questionFields: [
    { key: 'text', label: 'Question', type: 'textarea' },
    { key: 'answer', label: 'Bonne réponse (nombre)', type: 'number' },
    { key: 'unit', label: 'Unité', type: 'text', placeholder: 'km, €, habitants…', optional: true },
  ],
  summary: (q) => `${fmt(q.answer)} ${q.unit ?? ''}`,
  publicPayload: (q) => ({ text: q.text, unit: q.unit ?? '' }),
  solution: (q) => ({ answer: q.answer, label: `${fmt(q.answer)} ${q.unit ?? ''}`.trim() }),
  score: ({ q, answers, cfg }) => {
    const target = Number(q.answer)
    const valid = answers
      .filter((a) => typeof a.data.value === 'number' && Number.isFinite(a.data.value))
      .map((a) => ({ pid: a.pid, value: a.data.value as number, diff: Math.abs((a.data.value as number) - target), at: ms(a) }))
      .sort((a, b) => a.diff - b.diff || a.at - b.at)
    const ranked = podium(valid, parsePoints(cfg.podium), (a, b) => a.diff === b.diff)
    const results: Record<string, { pts: number; detail?: string }> = {}
    for (const r of ranked) results[r.pid] = { pts: r.pts, detail: `${fmt(r.value)} (écart ${fmt(r.diff)})` }
    return { results, summary: { ranking: ranked.map((r) => ({ pid: r.pid, value: r.value, rank: r.rank })) } }
  },
  Player: ({ round, answer, submit, locked }) => {
    const [v, setV] = useState<string>(answer?.data.value != null ? formatTyping(String(answer.data.value).replace('.', ',')) : '')
    const revealed = round.status === 'revealed'
    const parsed = parseTyping(v)
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        {revealed ? (
          <div className="big-answer">
            {round.solution?.label}
            {answer && <div className="muted small">Toi : {fmt(answer.data.value)}</div>}
          </div>
        ) : (
          <form
            className="free-answer"
            onSubmit={(e) => {
              e.preventDefault()
              if (Number.isFinite(parsed) && v.trim()) void submit({ value: parsed })
            }}
          >
            <div className="number-input">
              <input
                inputMode="decimal"
                value={v}
                onChange={(e) => setV(formatTyping(e.target.value))}
                placeholder="Ton estimation"
                disabled={locked}
              />
              {round.public.unit && <span>{round.public.unit}</span>}
            </div>
            <button className="btn btn-primary" disabled={locked || !v.trim() || !Number.isFinite(parsed)}>
              Envoyer
            </button>
          </form>
        )}
        {answer && !revealed && !locked && <Sent>Envoyé : {fmt(answer.data.value)}</Sent>}
        {locked && !revealed && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => (
    <>
      <QuestionText big>{round.public.text}</QuestionText>
      {round.status === 'revealed' && (
        <>
          <div className="big-answer">{round.solution?.label}</div>
          <RevealList round={round} names={namesOf(participants)} />
        </>
      )}
    </>
  ),
}
