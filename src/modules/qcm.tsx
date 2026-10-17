import { ChoiceButtons, Locked, QuestionText, RevealList, namesOf } from './common'
import type { ModuleDef } from './types'

export const qcm: ModuleDef = {
  key: 'qcm',
  name: 'QCM',
  icon: '🔤',
  tagline: '4 choix de réponses',
  rules: 'Choisis la bonne réponse parmi 4 avant la fin du temps.',
  defaults: { timer: 15, points: 3 },
  configFields: [{ key: 'points', label: 'Points par bonne réponse', type: 'number' }],
  questionFields: [
    { key: 'text', label: 'Question', type: 'textarea' },
    { key: 'answers', label: 'Réponses', type: 'choices4', correctKey: 'correct' },
  ],
  summary: (q) => `${(q.answers as string[])?.[q.correct as number] ?? '?'}`,
  publicPayload: (q) => ({ text: q.text, choices: q.answers }),
  solution: (q) => ({ correct: q.correct, label: (q.answers as string[])[q.correct as number] }),
  score: ({ q, answers, cfg }) => {
    const counts = [0, 0, 0, 0]
    const results: Record<string, { pts: number; detail?: string }> = {}
    for (const a of answers) {
      const c = a.data.choice as number
      if (c >= 0 && c < 4) counts[c]++
      results[a.pid] = { pts: c === q.correct ? Number(cfg.points) : 0 }
    }
    return { results, summary: { counts } }
  },
  Player: ({ round, answer, submit, locked }) => {
    const choices = round.public.choices as string[]
    const selected = answer?.data.choice ?? null
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <ChoiceButtons
          choices={choices}
          selected={selected}
          correct={revealed ? round.solution?.correct : null}
          disabled={locked || revealed}
          onPick={(i) => submit({ choice: i })}
        />
        {locked && !revealed && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => {
    const choices = round.public.choices as string[]
    if (round.status === 'revealed') {
      return (
        <>
          <QuestionText big>{round.public.text}</QuestionText>
          <ChoiceButtons choices={choices} disabled correct={round.solution?.correct} counts={round.summary?.counts ?? [0, 0, 0, 0]} />
          <RevealList round={round} names={namesOf(participants)} />
        </>
      )
    }
    return (
      <>
        <QuestionText big>{round.public.text}</QuestionText>
        <ChoiceButtons choices={choices} disabled />
      </>
    )
  },
}
