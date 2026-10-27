import { useState } from 'react'
import { ScaleScene, formatMeters } from '../components/ScaleScene'
import { CHOICE_COLORS, Locked, QuestionText, RevealList, Sent, ms, namesOf, parsePoints, podium } from './common'
import type { ModuleDef } from './types'

/** Le curseur va de la taille de référence ÷ RANGE à × RANGE, en échelle logarithmique */
const RANGE = 50
const STEPS = 1000
const toMeters = (step: number, ref: number) => Math.exp(Math.log(ref / RANGE) + (step / STEPS) * Math.log(RANGE * RANGE))
const toStep = (m: number, ref: number) => Math.round(((Math.log(m) - Math.log(ref / RANGE)) / Math.log(RANGE * RANGE)) * STEPS)
/** Écart relatif : se tromper de 20 cm sur une fourmi compte plus que sur une girafe */
export const relativeError = (guess: number, truth: number) => Math.abs(Math.log(guess / truth))

export const echelle: ModuleDef = {
  key: 'echelle',
  name: "À l'échelle",
  icon: '📏',
  tagline: 'Comparer des tailles',
  rules:
    "On te donne la taille d'une référence : règle le curseur pour donner la taille de l'autre. Les plus proches gagnent (l'écart est compté en proportion). Dans une manche, la référence est l'objet deviné juste avant.",
  defaults: { timer: 25, podium: '5,3,1' },
  configFields: [{ key: 'podium', label: 'Points du podium', type: 'text', help: 'ex : 5,3,1' }],
  questionFields: [
    { key: 'text', label: 'Question', type: 'text', placeholder: 'Quelle taille fait Pikachu ?' },
    { key: 'refName', label: 'Référence (nom)', type: 'text', placeholder: 'Un humain' },
    { key: 'refHeight', label: 'Taille de la référence (m)', type: 'number' },
    { key: 'refEmoji', label: 'Émoji de la référence', type: 'text', placeholder: '🧍' },
    { key: 'targetName', label: 'À deviner (nom)', type: 'text', placeholder: 'Pikachu' },
    { key: 'answer', label: 'Vraie taille (m)', type: 'number' },
    { key: 'targetEmoji', label: 'Émoji de ce qu’il faut deviner', type: 'text', placeholder: '⚡' },
    { key: 'refImage', label: 'Image de la référence (fond transparent, recadrée au plus près)', type: 'image', optional: true },
    { key: 'refLength', label: 'La taille de la référence est une longueur (sinon une hauteur)', type: 'bool' },
    { key: 'targetImage', label: 'Image à deviner (fond transparent, recadrée au plus près)', type: 'image', optional: true },
    { key: 'targetLength', label: 'La taille à deviner est une longueur (sinon une hauteur)', type: 'bool' },
  ],
  summary: (q) => `${q.targetName} : ${formatMeters(Number(q.answer))} (réf. ${q.refName} ${formatMeters(Number(q.refHeight))})`,
  usesPrevious: true,
  publicPayload: (q, { prev }) => {
    // Dans une manche, la référence est l'objet deviné à la question d'avant (la 1re garde celle de sa question),
    // sauf si l'écart de taille sort de la plage du curseur
    const ratio = prev ? Number(q.answer) / Number(prev.answer) : NaN
    const chained = prev && prev.targetName && ratio > 1.5 / RANGE && ratio < RANGE / 1.5
    return {
      text: q.text || `Quelle taille fait ${q.targetName} ?`,
      ...(chained
        ? {
            refName: prev.targetName,
            refHeight: Number(prev.answer),
            refEmoji: prev.targetEmoji || '❓',
            refImage: prev.targetImage || null,
            refLength: !!prev.targetLength,
          }
        : {
            refName: q.refName,
            refHeight: Number(q.refHeight),
            refEmoji: q.refEmoji || '🧍',
            refImage: q.refImage || null,
            refLength: !!q.refLength,
          }),
      targetName: q.targetName,
      targetEmoji: q.targetEmoji || '❓',
      // L'image ne dit rien de la taille : elle est montrée pendant la question, à la taille proposée par le joueur
      targetImage: q.targetImage || null,
      targetLength: !!q.targetLength,
    }
  },
  solution: (q) => ({ meters: Number(q.answer), label: `${q.targetName} : ${formatMeters(Number(q.answer))}`, targetImage: q.targetImage || null }),
  score: ({ q, answers, cfg }) => {
    const truth = Number(q.answer)
    const valid = answers
      .filter((a) => typeof a.data.value === 'number' && a.data.value > 0)
      .map((a) => ({ pid: a.pid, value: a.data.value as number, err: relativeError(a.data.value, truth), at: ms(a) }))
      .sort((a, b) => a.err - b.err || a.at - b.at)
    const ranked = podium(valid, parsePoints(cfg.podium), (a, b) => Math.abs(a.err - b.err) < 1e-9)
    const results: Record<string, { pts: number; detail?: string }> = {}
    for (const r of ranked) {
      const pct = Math.round((Math.exp(r.err) - 1) * 100)
      results[r.pid] = { pts: r.pts, detail: `${formatMeters(r.value)} (écart ${pct} %)` }
    }
    return { results, summary: { guesses: ranked.map((r) => ({ pid: r.pid, value: r.value })) } }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const p = round.public
    const ref = Number(p.refHeight) || 1
    const [step, setStep] = useState(() => toStep(answer?.data.value ?? ref, ref))
    const guess = toMeters(step, ref)
    const revealed = round.status === 'revealed'
    const shown = revealed ? round.solution?.meters : guess
    return (
      <>
        <QuestionText>{p.text}</QuestionText>
        <ScaleScene
          height={260}
          figures={[
            { label: p.refName, meters: ref, emoji: p.refEmoji, image: p.refImage ?? undefined, length: p.refLength },
            {
              label: revealed ? p.targetName : `${p.targetName} ?`,
              meters: shown,
              emoji: p.targetEmoji,
              image: p.targetImage ?? (revealed ? round.solution?.targetImage : undefined) ?? undefined,
              length: p.targetLength,
            },
          ]}
          marks={revealed && answer ? [{ meters: answer.data.value, label: 'Toi', color: CHOICE_COLORS[0] }] : []}
        />
        {!revealed && (
          <div className="scale-input">
            <input
              id="scale-slider"
              type="range"
              min={0}
              max={STEPS}
              value={step}
              disabled={locked}
              onChange={(e) => setStep(Number(e.target.value))}
              aria-label={`Taille de ${p.targetName}`}
            />
            <div className="scale-value">{formatMeters(guess)}</div>
            <button className="btn btn-primary btn-block" disabled={locked} onClick={() => submit({ value: Number(guess.toPrecision(3)) })}>
              Valider {formatMeters(guess)}
            </button>
          </div>
        )}
        {answer && !locked && !revealed && <Sent>Envoyé : {formatMeters(answer.data.value)}</Sent>}
        {revealed && (
          <div className="big-answer">
            {round.solution?.label}
            <div className="muted small">{round.results?.[me.id]?.detail ?? 'Pas de réponse'}</div>
          </div>
        )}
        {locked && !revealed && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => {
    const p = round.public
    const revealed = round.status === 'revealed'
    const names = namesOf(participants)
    const guesses: { pid: string; value: number }[] = round.summary?.guesses ?? []
    return (
      <div className="scale-screen">
        <div>
          <QuestionText big>{p.text}</QuestionText>
          {revealed && (
            <>
              <div className="big-answer">{round.solution?.label}</div>
              <RevealList round={round} names={names} />
            </>
          )}
        </div>
        <ScaleScene
          height={480}
          unknownMeters={Number(p.refHeight)}
          figures={[
            { label: p.refName, meters: Number(p.refHeight), emoji: p.refEmoji, image: p.refImage ?? undefined, length: p.refLength },
            {
              label: p.targetName,
              meters: revealed ? round.solution?.meters : null,
              emoji: p.targetEmoji,
              image: p.targetImage ?? (revealed ? round.solution?.targetImage : undefined) ?? undefined,
              length: p.targetLength,
            },
          ]}
          marks={revealed ? guesses.slice(0, 6).map((g, i) => ({ meters: g.value, label: names[g.pid] ?? '?', color: CHOICE_COLORS[i % 4] })) : []}
        />
      </div>
    )
  },
}
