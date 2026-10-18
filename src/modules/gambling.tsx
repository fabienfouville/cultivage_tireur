import { useEffect, useState } from 'react'
import { CHOICE_COLORS, CHOICE_SHAPES, ChoiceButtons, Locked, QuestionText, RevealList, Sent, namesOf } from './common'
import type { ModuleDef } from './types'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const cleanBets = (b: unknown): number[] =>
  Array.isArray(b) ? [0, 1, 2, 3].map((i) => Math.max(0, Math.floor(Number(b[i]) || 0))) : [0, 0, 0, 0]

/** Jetons restants d'un joueur sur la manche (marche aussi pour ceux arrivés en cours de route) */
export const tokensLeft = (block: { tokensStart?: number; spent?: Record<string, number> }, pid: string) =>
  Math.max(0, (block.tokensStart ?? 0) - (block.spent?.[pid] ?? 0))

export const gambling: ModuleDef = {
  key: 'gambling',
  name: 'Gambling',
  icon: '🎲',
  tagline: 'Miser des jetons sur les choix',
  rules:
    'Tu as un stock de jetons pour toute la manche. Répartis tes mises sur les 4 choix : chaque jeton posé sur la bonne réponse rapporte des points, les jetons misés sont dépensés. Si tu ne mises rien, tu perds quand même ta part de jetons de la question.',
  defaults: { timer: 30, tokensPerQuestion: 3, multiplier: 1 },
  configFields: [
    { key: 'tokensPerQuestion', label: 'Jetons par question', type: 'number', help: '3 → 30 jetons pour 10 questions ; ne pas miser fait perdre ces jetons' },
    { key: 'multiplier', label: 'Points par jeton gagnant', type: 'number' },
  ],
  questionFields: [
    { key: 'text', label: 'Question', type: 'textarea' },
    { key: 'answers', label: 'Réponses', type: 'choices4', correctKey: 'correct' },
  ],
  summary: (q) => `${(q.answers as string[])?.[q.correct as number] ?? '?'}`,
  publicPayload: (q) => ({ text: q.text, choices: q.answers }),
  solution: (q) => ({ correct: q.correct, label: (q.answers as string[])[q.correct as number] }),
  initBlock: (block, participants, cfg) => {
    const tokens = block.tokensStart ?? Number(cfg.tokensPerQuestion) * block.questionIds.length
    return { block: { tokensStart: tokens, spent: {} } }
  },
  score: ({ q, answers, cfg, participants, block }) => {
    const totals = [0, 0, 0, 0]
    const results: Record<string, { pts: number; detail?: string }> = {}
    const spent = { ...(block.spent ?? {}) }
    const byPid = new Map(answers.map((a) => [a.pid, a]))
    const share = Math.max(0, Number(cfg.tokensPerQuestion) || 0)
    for (const p of participants) {
      const have = tokensLeft(block, p.id)
      let bets = cleanBets(byPid.get(p.id)?.data.bets)
      // Sécurité : on ne peut pas miser plus que ce qu'on a
      if (sum(bets) > have) bets = [0, 0, 0, 0]
      if (sum(bets) === 0) {
        // Pas de mise : on perd quand même sa part de la question
        const lost = Math.min(share, have)
        spent[p.id] = (spent[p.id] ?? 0) + lost
        results[p.id] = { pts: 0, detail: lost ? `pas de mise : −${lost} jeton${lost > 1 ? 's' : ''}` : 'plus de jetons' }
        continue
      }
      bets.forEach((b, i) => (totals[i] += b))
      const won = bets[q.correct as number] * Number(cfg.multiplier || 1)
      spent[p.id] = (spent[p.id] ?? 0) + sum(bets)
      results[p.id] = { pts: won, detail: `misé ${sum(bets)}` }
    }
    return { results, block: { spent }, summary: { counts: totals } }
  },
  Player: ({ round, block, answer, submit, locked, me }) => {
    const have = tokensLeft(block, me.id)
    const [bets, setBets] = useState<number[]>(cleanBets(answer?.data.bets))
    // Mises déjà envoyées (ex. après un rechargement de la page)
    useEffect(() => {
      if (answer) setBets(cleanBets(answer.data.bets))
    }, [answer?.id])
    const revealed = round.status === 'revealed'
    const left = have - sum(bets)
    const shown = revealed ? have : left
    const plural = shown > 1 ? 's' : ''
    const choices = round.public.choices as string[]
    const change = (i: number, d: number) =>
      setBets((b) => {
        const n = [...b]
        n[i] = Math.max(0, n[i] + d)
        return sum(n) > have ? b : n
      })
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <div className="tokens">
          🪙 <b>{shown}</b> jeton{plural} {revealed ? `restant${plural}` : 'à miser'}
        </div>
        <div className="bets">
          {choices.map((c, i) => (
            <div
              key={i}
              className={
                'bet' +
                (revealed && round.solution?.correct === i ? ' choice-correct' : '') +
                (revealed && round.solution?.correct !== i ? ' choice-dim' : '')
              }
              style={{ ['--c' as any]: CHOICE_COLORS[i] }}
            >
              <span className="bet-label">
                {CHOICE_SHAPES[i]} {c}
              </span>
              <span className="bet-ctrl">
                <button type="button" disabled={locked || revealed || bets[i] === 0} onClick={() => change(i, -1)}>
                  −
                </button>
                <b>{bets[i]}</b>
                <button type="button" disabled={locked || revealed || left <= 0} onClick={() => change(i, +1)}>
                  +
                </button>
              </span>
            </div>
          ))}
        </div>
        {!revealed && (
          <button className="btn btn-primary btn-block" disabled={locked} onClick={() => submit({ bets })}>
            Valider mes mises ({sum(bets)})
          </button>
        )}
        {answer && !locked && !revealed && <Sent>Mises enregistrées : {sum(cleanBets(answer.data.bets))} jetons</Sent>}
        {locked && !revealed && <Locked />}
      </>
    )
  },
  Screen: ({ round, block, participants }) => {
    const choices = round.public.choices as string[]
    return (
      <>
        <QuestionText big>{round.public.text}</QuestionText>
        {round.status === 'revealed' ? (
          <>
            <ChoiceButtons choices={choices} disabled correct={round.solution?.correct} counts={round.summary?.counts ?? [0, 0, 0, 0]} />
            <p className="muted center">Nombre de jetons misés sur chaque réponse</p>
            <RevealList round={round} names={namesOf(participants)} />
          </>
        ) : (
          <>
            <div className="choices">
              {choices.map((c, i) => (
                <div key={i} className="choice" style={{ ['--c' as any]: CHOICE_COLORS[i] }}>
                  <span className="choice-shape">{CHOICE_SHAPES[i]}</span>
                  {c}
                </div>
              ))}
            </div>
            <p className="muted center">
              🪙 Jetons : {participants.filter((p) => !p.kicked).map((p) => `${p.name} ${tokensLeft(block, p.id)}`).join(' · ')}
            </p>
          </>
        )}
      </>
    )
  },
}
