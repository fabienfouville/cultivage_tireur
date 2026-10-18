import { FreeAnswer, Locked, QuestionText, RevealList, Sent, groupFreeAnswers, isValidated, namesOf, parsePoints } from './common'
import type { ModuleDef } from './types'

const cluesOf = (q: Record<string, unknown>): string[] =>
  (Array.isArray(q.clues) ? (q.clues as string[]) : []).map((c) => String(c).trim()).filter(Boolean)

/** Nombre d'indices visibles : un nouvel indice à intervalles réguliers, tous visibles une fois la question fermée */
export const visibleClues = (status: string, left: number, duration: number, total: number) => {
  if (status !== 'answering' || duration <= 0) return total
  const elapsed = Math.max(0, duration - left)
  return Math.min(total, Math.floor(elapsed / (duration / total)) + 1)
}

/** Points selon l'indice auquel on a répondu (1 = le premier) */
export const pointsAtClue = (clue: number, points: number[]) => points[Math.min(points.length, Math.max(1, clue)) - 1] ?? 0

export const quisuisje: ModuleDef = {
  key: 'quisuisje',
  name: 'Qui suis-je ?',
  icon: '🕵️',
  tagline: 'Deviner avec le moins d’indices possible',
  rules:
    "Les indices arrivent un par un, du plus dur au plus facile. Tu n'as qu'une réponse : plus tu réponds tôt, plus tu gagnes, mais une erreur ne rapporte rien.",
  defaults: { timer: 50, points: '5,4,3,2,1' },
  configFields: [{ key: 'points', label: 'Points selon l’indice (1er, 2e, …)', type: 'text', help: 'ex. 5,4,3,2,1' }],
  questionFields: [
    { key: 'text', label: 'Question (ex. Qui suis-je ?)', type: 'text' },
    { key: 'clues', label: 'Indices, un par ligne, du plus dur au plus facile', type: 'list' },
    { key: 'answerHint', label: 'Réponse attendue', type: 'text', placeholder: 'variantes séparées par /' },
  ],
  manual: true,
  summary: (q) => String(q.answerHint ?? ''),
  // Les indices ne sont pas la réponse : ils sont publiés d'un coup et affichés au fil du temps
  publicPayload: (q) => ({ text: q.text || 'Qui suis-je ?', clues: cluesOf(q) }),
  solution: (q) => ({ label: String(q.answerHint ?? '').split('/')[0].trim() }),
  validationItems: ({ q, answers }) => groupFreeAnswers(answers, (a) => a.data.text, q.answerHint),
  describe: (d) => (d.text ? `${d.text} (indice ${d.clue ?? '?'})` : ''),
  score: ({ answers, cfg, verdicts, round }) => {
    const points = parsePoints(cfg.points, [5, 4, 3, 2, 1])
    const total = (round.public.clues ?? []).length || 5
    const start = round.startedAt?.toMillis?.()
    const results: Record<string, { pts: number; detail?: string }> = {}
    for (const a of answers) {
      // L'indice est recalculé avec l'heure du serveur (1,5 s de marge pour le réseau) : le téléphone n'a pas le dernier mot
      const at = a.at?.toMillis?.()
      const byTime = start && at ? visibleClues('answering', round.duration - (at - start - 1500) / 1000, round.duration, total) : undefined
      const clue = Math.max(Number(a.data.clue) || 1, byTime ?? 1)
      const ok = isValidated({ verdicts }, a.data.text)
      results[a.pid] = { pts: ok ? pointsAtClue(clue, points) : 0, detail: `« ${a.data.text} » à l'indice ${clue} ${ok ? '✅' : '❌'}` }
    }
    return { results }
  },
  Player: ({ round, answer, submit, locked, left, me }) => {
    const clues: string[] = round.public.clues ?? []
    const shown = visibleClues(round.status, left, round.duration, clues.length)
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <Clues clues={clues} shown={shown} />
        {revealed ? (
          <div className="big-answer">
            {round.solution?.label}
            {answer && <div className="muted small">{round.results?.[me.id]?.detail}</div>}
          </div>
        ) : round.status === 'validating' ? (
          <p className="center muted">L'animateur valide les réponses…</p>
        ) : answer ? (
          <Sent final>
            Réponse verrouillée à l'indice {answer.data.clue} : « {answer.data.text} »
          </Sent>
        ) : locked ? (
          <Locked />
        ) : (
          <FreeAnswer placeholder="Une seule réponse !" onSubmit={(text) => submit({ text, clue: shown })} />
        )}
      </>
    )
  },
  Screen: ({ round, participants, left }) => {
    const clues: string[] = round.public.clues ?? []
    const shown = visibleClues(round.status, left, round.duration, clues.length)
    return (
      <>
        <QuestionText big>{round.public.text}</QuestionText>
        <Clues clues={clues} shown={shown} big />
        {round.status === 'validating' && <p className="muted center">Validation en cours…</p>}
        {round.status === 'revealed' && (
          <>
            <div className="big-answer">{round.solution?.label}</div>
            <RevealList round={round} names={namesOf(participants)} />
          </>
        )}
      </>
    )
  },
}

function Clues({ clues, shown, big }: { clues: string[]; shown: number; big?: boolean }) {
  return (
    <ol className={'clues' + (big ? ' clues-big' : '')}>
      {clues.map((c, i) => (
        <li key={i} className={i < shown ? 'clue-on' : 'clue-off'}>
          {i < shown ? c : `Indice ${i + 1}…`}
        </li>
      ))}
    </ol>
  )
}
