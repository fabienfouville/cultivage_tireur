import { FreeAnswer, Locked, QuestionText, RevealList, Sent, firstVariant, groupFreeAnswers, isValidated, namesOf } from './common'
import type { ModuleDef } from './types'

export const cash: ModuleDef = {
  key: 'cash',
  name: 'Cash',
  icon: '💬',
  tagline: 'Réponse libre validée',
  rules: "Tape ta réponse. L'animateur valide les bonnes réponses.",
  defaults: { timer: 30, points: 5 },
  configFields: [{ key: 'points', label: 'Points par bonne réponse', type: 'number' }],
  questionFields: [
    { key: 'text', label: 'Question', type: 'textarea' },
    { key: 'answerHint', label: 'Réponse attendue', type: 'text', placeholder: 'variantes séparées par /' },
  ],
  manual: true,
  summary: (q) => String(q.answerHint ?? ''),
  publicPayload: (q) => ({ text: q.text }),
  solution: (q) => ({ label: firstVariant(q.answerHint) }),
  validationItems: ({ q, answers }) => groupFreeAnswers(answers, (a) => a.data.text, q.answerHint),
  score: ({ answers, cfg, verdicts }) => {
    const results: Record<string, { pts: number; detail?: string }> = {}
    for (const a of answers) {
      const ok = isValidated({ verdicts }, a.data.text)
      results[a.pid] = { pts: ok ? Number(cfg.points) : 0, detail: `« ${a.data.text} » ${ok ? '✅' : '❌'}` }
    }
    return { results }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        {revealed ? (
          <div className="big-answer">
            {round.solution?.label}
            {answer && <div className="muted small">{round.results?.[me.id]?.detail}</div>}
          </div>
        ) : round.status === 'validating' ? (
          <p className="center muted">L'animateur valide les réponses…</p>
        ) : (
          <>
            <FreeAnswer initial={answer?.data.text} disabled={locked} onSubmit={(text) => submit({ text })} />
            {answer && !locked && <Sent>Envoyé : « {answer.data.text} »</Sent>}
            {locked && <Locked />}
          </>
        )}
      </>
    )
  },
  Screen: ({ round, participants }) => (
    <>
      <QuestionText big>{round.public.text}</QuestionText>
      {round.status === 'validating' && <p className="muted center">Validation en cours…</p>}
      {round.status === 'revealed' && (
        <>
          <div className="big-answer">{round.solution?.label}</div>
          <RevealList round={round} names={namesOf(participants)} />
        </>
      )}
    </>
  ),
}
