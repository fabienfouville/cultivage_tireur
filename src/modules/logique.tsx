import { normalize } from '../lib/normalize'
import { ChoiceButtons, FreeAnswer, Locked, QuestionText, RevealList, Sent, namesOf } from './common'
import type { ModuleDef } from './types'

const choicesOf = (q: Record<string, unknown>): string[] =>
  (Array.isArray(q.choices) ? (q.choices as string[]) : []).map((c) => String(c).trim()).filter(Boolean)
const variants = (answer: unknown) =>
  String(answer ?? '')
    .split('/')
    .map(normalize)
    .filter(Boolean)
/** Bonne réponse ? Comparaison exacte (sans accents, majuscules ni ponctuation) avec l'une des variantes */
export const isRight = (q: Record<string, unknown>, data: Record<string, any>) => {
  const ok = variants(q.answer)
  const choices = choicesOf(q)
  const given = choices.length && typeof data.choice === 'number' ? choices[data.choice] : data.text
  return ok.includes(normalize(given))
}
/** Points selon la difficulté : 90 % de réussite → 1 point, 1 % → le maximum */
export const pointsFor = (percent: unknown, max: number) => {
  const p = Math.min(99, Math.max(1, Number(percent) || 50))
  return Math.max(1, Math.round((max * (100 - p)) / 99))
}

function Percent({ value }: { value: unknown }) {
  if (value == null || value === '') return null
  return <span className="percent-badge">{Number(value)} % trouvent</span>
}

export const logique: ModuleDef = {
  key: 'logique',
  name: '100% Logique',
  icon: '🧠',
  tagline: 'Logique et observation, pas de culture',
  rules:
    "Pas besoin de culture : la réponse est sous tes yeux. Les questions sont de plus en plus dures (le % indique la part de gens qui trouvent) et rapportent de plus en plus. Une erreur ne rapporte rien, mais tu continues à jouer.",
  defaults: { timer: 30, maxPoints: 10 },
  configFields: [
    { key: 'maxPoints', label: 'Points de la question la plus dure (1 %)', type: 'number', help: 'une question à 90 % rapporte 1 point' },
  ],
  questionFields: [
    { key: 'text', label: 'Énigme (plusieurs lignes possibles)', type: 'textarea' },
    { key: 'choices', label: 'Propositions, une par ligne (laisser vide pour une réponse libre)', type: 'list', optional: true },
    { key: 'answer', label: 'Bonne réponse (pour les propositions : le texte exact ; variantes séparées par /)', type: 'text' },
    { key: 'percent', label: '% de gens qui trouvent (90 = facile, 1 = très dur)', type: 'number' },
    { key: 'explain', label: 'Explication affichée à la révélation', type: 'textarea', optional: true },
  ],
  ordered: true,
  orderBy: (q) => -(Number(q.percent) || 50),
  summary: (q) => `${q.answer} · ${q.percent ?? '?'} %`,
  publicPayload: (q) => ({ text: q.text, choices: choicesOf(q), percent: q.percent ?? null }),
  solution: (q) => ({ label: String(q.answer ?? '').split('/')[0].trim(), explain: q.explain ?? '' }),
  isComplete: (d) => typeof d.choice === 'number' || !!String(d.text ?? '').trim(),
  score: ({ q, answers, cfg, participants }) => {
    const pts = pointsFor(q.percent, Number(cfg.maxPoints) || 10)
    const byPid = new Map(answers.map((a) => [a.pid, a]))
    const results: Record<string, { pts: number; detail?: string }> = {}
    const choices = choicesOf(q)
    let right = 0
    for (const p of participants) {
      if (p.kicked) continue
      const a = byPid.get(p.id)
      const said = a ? (choices.length ? choices[a.data.choice] ?? '?' : String(a.data.text ?? '')) : 'pas de réponse'
      const ok = !!a && isRight(q, a.data)
      if (ok) right++
      results[p.id] = { pts: ok ? pts : 0, detail: said }
    }
    return { results, summary: { right } }
  },
  Player: ({ round, answer, submit, locked }) => {
    const revealed = round.status === 'revealed'
    const choices: string[] = round.public.choices ?? []
    return (
      <>
        <div className="center">
          <Percent value={round.public.percent} />
        </div>
        <QuestionText>
          <span className="logic-text">{round.public.text}</span>
        </QuestionText>
        {choices.length ? (
          <ChoiceButtons
            choices={choices}
            selected={answer?.data.choice ?? null}
            correct={revealed ? choices.findIndex((c) => normalize(c) === normalize(round.solution?.label)) : null}
            disabled={locked || revealed}
            onPick={(i) => submit({ choice: i })}
          />
        ) : revealed ? null : (
          <>
            <FreeAnswer initial={answer?.data.text} disabled={locked} placeholder="Ta réponse (un mot, un nombre…)" onSubmit={(text) => submit({ text })} />
            {answer && !locked && <Sent>Envoyé : « {answer.data.text} »</Sent>}
          </>
        )}
        {revealed && (
          <div className="big-answer">
            {round.solution?.label}
            {round.solution?.explain && <div className="muted small">{round.solution.explain}</div>}
          </div>
        )}
        {locked && !revealed && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => {
    const choices: string[] = round.public.choices ?? []
    const revealed = round.status === 'revealed'
    return (
      <>
        <div className="center">
          <Percent value={round.public.percent} />
        </div>
        <QuestionText big>
          <span className="logic-text">{round.public.text}</span>
        </QuestionText>
        {choices.length > 0 && (
          <ChoiceButtons
            choices={choices}
            disabled
            correct={revealed ? choices.findIndex((c) => normalize(c) === normalize(round.solution?.label)) : null}
          />
        )}
        {revealed && (
          <>
            <div className="big-answer">
              {round.solution?.label}
              {round.solution?.explain && <div className="muted small">{round.solution.explain}</div>}
            </div>
            <RevealList round={round} names={namesOf(participants)} />
          </>
        )}
      </>
    )
  },
}
