import { PixelImage } from '../components/PixelImage'
import { FreeAnswer, Locked, QuestionText, RevealList, Sent, groupFreeAnswers, isValidated, ms, namesOf, parsePoints, podium } from './common'
import type { ModuleDef } from './types'

/**
 * Avancement de la dépixellisation (0 → 1). L'image ne change que par paliers de `step` secondes,
 * pour laisser le temps de l'observer ; elle devient nette à la révélation.
 */
export const progress = (status: string, left: number, duration: number, step = 3) => {
  if (status !== 'answering') return 1
  const d = Math.max(1, duration)
  const elapsed = Math.min(d, Math.max(0, d - left))
  const s = step > 0 ? step : 1
  return (Math.floor(elapsed / s) * s) / d
}

export const pixel: ModuleDef = {
  key: 'pixel',
  name: 'Pixel',
  icon: '🖼️',
  tagline: 'Réponse libre validée',
  rules: "L'image se précise petit à petit. Les plus rapides à trouver gagnent (podium).",
  defaults: { timer: 30, podium: '5,3,1', startCells: 5, curve: 2.5, step: 3 },
  configFields: [
    { key: 'podium', label: 'Points du podium (vitesse)', type: 'text', help: 'ex : 5,3,1' },
    { key: 'startCells', label: 'Pixellisation de départ', type: 'number', help: "nombre de gros pixels en largeur au début (5 = illisible)" },
    { key: 'step', label: "Changement d'image toutes les… (s)", type: 'number', help: "l'image se précise par paliers (3 s par défaut)" },
    { key: 'curve', label: 'Courbe de dépixellisation', type: 'number', help: "plus c'est grand, plus l'image reste floue longtemps avant de se révéler d'un coup (2,5 par défaut)" },
  ],
  questionFields: [
    { key: 'text', label: 'Question', type: 'text', placeholder: 'Qui est-ce ?' },
    { key: 'imageUrl', label: 'Image', type: 'image' },
    { key: 'answerHint', label: 'Réponse attendue', type: 'text', placeholder: 'variantes séparées par /' },
  ],
  manual: true,
  summary: (q) => String(q.answerHint ?? ''),
  publicPayload: (q, { cfg }) => ({
    text: q.text,
    imageUrl: q.imageUrl,
    startCells: Number(cfg.startCells) || 5,
    curve: Number(cfg.curve) || 2.5,
    step: Number(cfg.step) || 3,
  }),
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
  Player: ({ round, answer, submit, locked, me }) => {
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        {revealed ? (
          <img src={round.public.imageUrl} alt="" className="pixel-img" />
        ) : (
          <p className="center muted small">👀 Regarde l'image sur l'écran commun</p>
        )}
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
        <PixelImage
          src={round.public.imageUrl}
          progress={progress(round.status, left, round.duration, round.public.step)}
          startCells={round.public.startCells}
          curve={round.public.curve}
        />
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
