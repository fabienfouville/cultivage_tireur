import { ChoiceButtons, FreeAnswer, Locked, QuestionText, RevealList, Sent, groupFreeAnswers, isValidated, namesOf } from './common'
import type { ModuleDef } from './types'

type Mode = 'duo' | 'carre' | 'cash'
const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: 'duo', label: 'Duo', icon: '✌️' },
  { key: 'carre', label: 'Carré', icon: '🟩' },
  { key: 'cash', label: 'Cash', icon: '💰' },
]
const correctLabel = (q: Record<string, unknown>) => (q.choices as string[])?.[q.correctIndex as number] ?? ''

export const duoCarreCash: ModuleDef = {
  key: 'duo-carre-cash',
  name: 'Duo/Carré',
  icon: '👥',
  tagline: 'Duo ou Carré + Cash',
  rules: 'Choisis ton niveau de risque : Duo (2 propositions), Carré (4) ou Cash (réponse libre). Plus c’est risqué, plus ça rapporte.',
  defaults: { timer: 30, duo: 1, carre: 3, cash: 5 },
  configFields: [
    { key: 'duo', label: 'Points Duo', type: 'number' },
    { key: 'carre', label: 'Points Carré', type: 'number' },
    { key: 'cash', label: 'Points Cash', type: 'number' },
  ],
  questionFields: [
    { key: 'text', label: 'Question', type: 'textarea' },
    { key: 'choices', label: 'Propositions', type: 'choices4', correctKey: 'correctIndex' },
    { key: 'answerHint', label: 'Variantes acceptées en Cash', type: 'text', optional: true, placeholder: 'séparées par /' },
  ],
  manual: true,
  isComplete: (d) => !!d.mode && (d.choice != null || !!String(d.text ?? '').trim()),
  summary: (q) => correctLabel(q),
  publicPayload: (q) => {
    // La paire du Duo est tirée au lancement de la question (même paire pour tout le monde)
    const correct = q.correctIndex as number
    const wrong = [0, 1, 2, 3].filter((i) => i !== correct)
    const other = wrong[Math.floor(Math.random() * wrong.length)]
    return { text: q.text, choices: q.choices, duo: [correct, other].sort() }
  },
  solution: (q) => ({ correct: q.correctIndex, label: correctLabel(q) }),
  validationItems: ({ q, answers }) =>
    groupFreeAnswers(
      answers.filter((a) => a.data.mode === 'cash'),
      (a) => a.data.text,
      [correctLabel(q), q.answerHint].filter(Boolean).join('/'),
    ),
  score: ({ q, answers, cfg, verdicts }) => {
    const results: Record<string, { pts: number; detail?: string }> = {}
    const modes = { duo: 0, carre: 0, cash: 0 }
    for (const a of answers) {
      const mode = a.data.mode as Mode
      if (!(mode in modes)) continue
      modes[mode]++
      const ok =
        mode === 'cash' ? isValidated({ verdicts }, a.data.text) : a.data.choice === (q.correctIndex as number)
      results[a.pid] = {
        pts: ok ? Number(cfg[mode]) : 0,
        detail: `${MODES.find((m) => m.key === mode)!.label} ${ok ? '✅' : '❌'}`,
      }
    }
    return { results, summary: { modes } }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const mode = answer?.data.mode as Mode | undefined
    const revealed = round.status === 'revealed'
    const choices = round.public.choices as string[]
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        {!mode && !revealed && round.status === 'answering' && (
          <div className="modes">
            {MODES.map((m) => (
              <button key={m.key} className="btn mode-btn" disabled={locked} onClick={() => submit({ mode: m.key })}>
                <span className="huge">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        )}
        {(mode === 'duo' || mode === 'carre') && (
          <ChoiceButtons
            choices={choices}
            show={mode === 'duo' ? round.public.duo : undefined}
            selected={answer?.data.choice ?? null}
            correct={revealed ? round.solution?.correct : null}
            disabled={locked || revealed || answer?.data.choice != null}
            onPick={(i) => submit({ mode, choice: i })}
          />
        )}
        {mode === 'cash' && round.status === 'answering' && (
          <FreeAnswer initial={answer?.data.text} disabled={locked} onSubmit={(text) => submit({ mode, text })} />
        )}
        {mode === 'cash' && answer?.data.text && !revealed && !locked && <Sent>Envoyé : « {answer.data.text} »</Sent>}
        {round.status === 'validating' && <p className="center muted">L'animateur valide les réponses Cash…</p>}
        {revealed && (
          <div className="big-answer">
            {round.solution?.label}
            <div className="muted small">{round.results?.[me.id]?.detail}</div>
          </div>
        )}
        {locked && round.status === 'answering' && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => (
    <>
      <QuestionText big>{round.public.text}</QuestionText>
      {round.status === 'revealed' ? (
        <>
          <div className="big-answer">{round.solution?.label}</div>
          <p className="muted center">
            Duo {round.summary?.modes?.duo ?? 0} · Carré {round.summary?.modes?.carre ?? 0} · Cash {round.summary?.modes?.cash ?? 0}
          </p>
          <RevealList round={round} names={namesOf(participants)} />
        </>
      ) : (
        <p className="center muted">Duo ✌️ · Carré 🟩 · Cash 💰 — à vous de choisir !</p>
      )}
    </>
  ),
}
