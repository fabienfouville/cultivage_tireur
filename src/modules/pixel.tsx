import { PixelImage } from '../components/PixelImage'
import { FreeAnswer, Locked, QuestionText, RevealList, Sent, groupFreeAnswers, isValidated, ms, namesOf, parsePoints, podium } from './common'
import type { ModuleDef } from './types'

const progress = (status: string, left: number, duration: number) =>
  status === 'answering' ? 1 - Math.max(0, left) / Math.max(1, duration) : 1

export const pixel: ModuleDef = {
  key: 'pixel',
  name: 'Pixel',
  icon: '🖼️',
  tagline: 'Réponse libre validée',
  rules: "L'image se précise petit à petit. Les plus rapides à trouver gagnent (podium).",
  defaults: { timer: 30, podium: '5,3,1' },
  configFields: [{ key: 'podium', label: 'Points du podium (vitesse)', type: 'text', help: 'ex : 5,3,1' }],
  questionFields: [
    { key: 'text', label: 'Question', type: 'text', placeholder: 'Qui est-ce ?' },
    { key: 'imageUrl', label: 'Image', type: 'image' },
    { key: 'answerHint', label: 'Réponse attendue', type: 'text', placeholder: 'variantes séparées par /' },
  ],
  manual: true,
  summary: (q) => String(q.answerHint ?? ''),
  publicPayload: (q) => ({ text: q.text, imageUrl: q.imageUrl }),
  solution: (q) => ({ label: q.answerHint }),
  validationItems: ({ q, answers }) => groupFreeAnswers(answers, (a) => a.data.text, q.answerHint),
  score: ({ answers, cfg, verdicts }) => {
    const good = answers
      .filter((a) => isValidated({ verdicts }, a.data.text))
      .map((a) => ({ pid: a.pid, at: ms(a), text: a.data.text as string }))
      .sort((a, b) => a.at - b.at)
    const ranked = podium(good, parsePoints(cfg.podium), () => false)
    const results: Record<string, { pts: number; detail?: string }> = {}
    for (const a of answers) results[a.pid] = { pts: 0, detail: `« ${a.data.text} » ❌` }
    for (const r of ranked) results[r.pid] = { pts: r.pts, detail: `« ${r.text} » ✅ ${r.rank}ᵉ` }
    return { results }
  },
  Player: ({ round, answer, submit, locked, left, me }) => {
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <PixelImage src={round.public.imageUrl} progress={progress(round.status, left, round.duration)} />
        {revealed ? (
          <div className="big-answer">
            {round.solution?.label}
            <div className="muted small">{round.results?.[me.id]?.detail}</div>
          </div>
        ) : round.status === 'validating' ? (
          <p className="center muted">L'animateur valide les réponses…</p>
        ) : (
          <>
            <FreeAnswer initial={answer?.data.text} disabled={locked} onSubmit={(text) => submit({ text })} />
            {answer && !locked && <Sent>Envoyé : « {answer.data.text} » — la vitesse compte !</Sent>}
            {locked && <Locked />}
          </>
        )}
      </>
    )
  },
  Screen: ({ round, participants, left }) => (
    <div className="pixel-screen">
      <div>
        <QuestionText big>{round.public.text}</QuestionText>
        <PixelImage src={round.public.imageUrl} progress={progress(round.status, left, round.duration)} />
      </div>
      {round.status === 'revealed' && (
        <div>
          <div className="big-answer">{round.solution?.label}</div>
          <RevealList round={round} names={namesOf(participants)} />
        </div>
      )}
    </div>
  ),
}
