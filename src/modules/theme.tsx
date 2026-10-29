import { looksRight, normalize } from '../lib/normalize'
import { FreeAnswer, Locked, QuestionText, RevealList, namesOf } from './common'
import type { ModuleDef, ValidationItem } from './types'

const list = (data: Record<string, any> | undefined): string[] => (Array.isArray(data?.items) ? data!.items : [])
/** Exemples de bonnes réponses de la question (« Chêne, hêtre, sapin… ») */
export const examplesOf = (hint: unknown): string[] =>
  String(hint ?? '')
    .split(/[,;/…]|\.{3}| et /)
    .map((x) => x.replace(/\(.*?\)/g, '').trim())
    .filter((x) => normalize(x))
/** Réponse reconnue parmi les exemples : validée d'office, les autres restent à corriger par l'animateur */
export const isKnownAnswer = (raw: unknown, hint: unknown) => examplesOf(hint).some((e) => looksRight(raw, e))

export const theme: ModuleDef = {
  key: 'theme',
  name: 'Thème',
  icon: '🗂️',
  tagline: 'Réponse libre validée',
  rules: "Donne un maximum de réponses qui collent au thème. 1 point par réponse validée, 3 si tu es le seul à l'avoir trouvée.",
  defaults: { timer: 45, points: 1, solo: 3 },
  configFields: [
    { key: 'points', label: 'Points par réponse validée', type: 'number' },
    { key: 'solo', label: 'Points si on est seul à avoir donné cette réponse', type: 'number' },
  ],
  questionFields: [
    { key: 'text', label: 'Thème à trouver', type: 'text', placeholder: 'Un pays d’Europe commençant par A' },
    { key: 'answerHint', label: 'Exemples de réponses (aide à la validation)', type: 'textarea', optional: true },
  ],
  manual: true,
  multiAnswer: true,
  summary: (q) => String(q.answerHint ?? ''),
  publicPayload: (q) => ({ text: q.text }),
  solution: (q) => ({ label: q.answerHint ?? '' }),
  validationItems: ({ q, answers }) => {
    const map = new Map<string, ValidationItem>()
    for (const a of answers) {
      for (const raw of list(a.data)) {
        const n = normalize(raw)
        if (!n) continue
        const it = map.get(n)
        if (it) {
          it.count++
          if (!it.pids!.includes(a.pid)) it.pids!.push(a.pid)
        } else map.set(n, { key: n, label: raw, count: 1, pids: [a.pid], suggested: isKnownAnswer(raw, q.answerHint) })
      }
    }
    // Les réponses reconnues d'abord, puis celles à corriger
    return [...map.values()].sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.label.localeCompare(b.label))
  },
  score: ({ answers, cfg, verdicts }) => {
    const results: Record<string, { pts: number; detail?: string }> = {}
    const mine = new Map(answers.map((a) => [a.pid, [...new Set(list(a.data).map(normalize))].filter(Boolean)]))
    // Combien de joueurs ont donné chaque réponse : une réponse trouvée seul rapporte plus
    const howMany = new Map<string, number>()
    for (const items of mine.values()) for (const n of items) howMany.set(n, (howMany.get(n) ?? 0) + 1)
    const solo = Number(cfg.solo ?? cfg.points)
    for (const a of answers) {
      const uniq = mine.get(a.pid) ?? []
      const ok = uniq.filter((n) => verdicts[n] === true)
      const alone = ok.filter((n) => howMany.get(n) === 1).length
      results[a.pid] = {
        pts: (ok.length - alone) * Number(cfg.points) + alone * solo,
        detail: `${ok.length}/${uniq.length} validée${ok.length > 1 ? 's' : ''}${alone ? ` dont ${alone} en solo ⭐` : ''}`,
      }
    }
    return { results }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const items = list(answer?.data)
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        {round.status === 'answering' && (
          <FreeAnswer
            clearOnSubmit
            disabled={locked}
            placeholder="Une réponse puis Entrée…"
            onSubmit={(v) => {
              if (items.some((i) => normalize(i) === normalize(v))) return
              return submit({ items: [...items, v] })
            }}
          />
        )}
        <ul className="chips">
          {items.map((it, i) => {
            const verdict = round.verdicts?.[normalize(it)]
            return (
              <li key={i} className={'chip' + (revealed ? (verdict ? ' chip-ok' : ' chip-ko') : '')}>
                {it}
                {round.status === 'answering' && !locked && (
                  <button type="button" onClick={() => submit({ items: items.filter((_, j) => j !== i) })} aria-label="Retirer">
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {revealed && <p className="center">{round.results?.[me.id]?.detail}</p>}
        {round.status === 'validating' && <p className="center muted">L'animateur valide les réponses…</p>}
        {locked && round.status === 'answering' && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => (
    <>
      <QuestionText big>{round.public.text}</QuestionText>
      {round.status === 'validating' && <p className="muted center">Validation en cours…</p>}
      {round.status === 'revealed' && (
        <>
          {round.solution?.label && <p className="muted center">Exemples : {round.solution.label}</p>}
          <RevealList round={round} names={namesOf(participants)} />
        </>
      )}
    </>
  ),
}
