import { useEffect, useRef, useState } from 'react'
import { CHOICE_COLORS, CHOICE_SHAPES, ChoiceButtons, Locked, QuestionText, RevealList, Sent, namesOf } from './common'
import type { ModuleDef } from './types'

// Money Drop (clé « gambling » conservée : les thèmes et réglages existants en dépendent)

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const cleanBets = (b: unknown): number[] =>
  Array.isArray(b) ? [0, 1, 2, 3].map((i) => Math.max(0, Math.floor(Number(b[i]) || 0))) : [0, 0, 0, 0]

/** Jetons encore en jeu pour un joueur (un joueur arrivé en cours de manche part avec le stock complet) */
export const tokensLeft = (block: { tokensStart?: number; bank?: Record<string, number> }, pid: string) =>
  Math.max(0, block.bank?.[pid] ?? block.tokensStart ?? 0)

/** Les mises respectent la règle : tout est posé, sans couvrir les 4 réponses (si la règle est active) */
export const betsValid = (bets: number[], have: number, keepOneEmpty: boolean) =>
  sum(bets) === have && (!keepOneEmpty || bets.some((b) => b === 0))

export const gambling: ModuleDef = {
  key: 'gambling',
  name: 'Money Drop',
  icon: '💰',
  tagline: 'Tout miser, ne garder que la bonne réponse',
  variantOf: 'qcm',
  variantName: '💰 Money Drop',
  rules:
    "Tu commences la manche avec un stock de jetons. À chaque question, répartis TOUS tes jetons sur les réponses, en laissant au moins une réponse vide. Seuls les jetons posés sur la bonne réponse restent, les autres tombent. Les jetons non posés à la fin du temps tombent aussi. À la fin de la manche, chaque jeton restant rapporte des points.",
  defaults: { timer: 30, stock: 20, multiplier: 1, keepOneEmpty: 1 },
  configFields: [
    { key: 'stock', label: 'Jetons au départ de la manche', type: 'number', help: 'ex. 20' },
    { key: 'multiplier', label: 'Points par jeton restant à la fin', type: 'number' },
    { key: 'keepOneEmpty', label: 'Laisser au moins une réponse vide (1 = oui, 0 = non)', type: 'number', help: 'comme dans l’émission' },
  ],
  questionFields: [
    { key: 'text', label: 'Question', type: 'textarea' },
    { key: 'answers', label: 'Réponses', type: 'choices4', correctKey: 'correct' },
  ],
  summary: (q) => `${(q.answers as string[])?.[q.correct as number] ?? '?'}`,
  publicPayload: (q, { cfg }) => ({ text: q.text, choices: q.answers, keepOneEmpty: Number(cfg.keepOneEmpty ?? 1) === 1 }),
  solution: (q) => ({ correct: q.correct, label: (q.answers as string[])[q.correct as number] }),
  initBlock: (block, _participants, cfg) => ({ block: { tokensStart: block.tokensStart ?? (Number(cfg.stock) || 20), bank: {} } }),
  // Plus de jetons : on regarde la suite sans jouer
  canAnswer: (block, pid) => tokensLeft(block, pid) > 0,
  blockOver: (block) => !!block.bank && Object.keys(block.bank).length > 0 && Object.values(block.bank).every((t) => t <= 0),
  isComplete: (d) => !!d.complete,
  describe: (d) => cleanBets(d.bets).join(' / '),
  // Les points ne tombent qu'à la fin de la manche : avant, on affiche les jetons qui restent
  resultBanner: ({ round, block, pid }) => {
    if (round.index + 1 >= round.total) return null
    const kept = tokensLeft(block, pid)
    return { text: `🪙 ${kept} jeton${kept > 1 ? 's' : ''} restant${kept > 1 ? 's' : ''}`, good: kept > 0 }
  },
  score: ({ q, answers, cfg, participants, block, round }) => {
    const totals = [0, 0, 0, 0]
    const results: Record<string, { pts: number; detail?: string }> = {}
    const bank = { ...(block.bank ?? {}) }
    const byPid = new Map(answers.map((a) => [a.pid, a]))
    const correct = q.correct as number
    const last = round.index + 1 >= round.total
    for (const p of participants) {
      if (p.kicked) continue
      const have = tokensLeft(block, p.id)
      if (have <= 0) continue
      let bets = cleanBets(byPid.get(p.id)?.data.bets)
      // Sécurité : on ne peut pas poser plus que ce qu'on a
      if (sum(bets) > have) bets = [0, 0, 0, 0]
      bets.forEach((b, i) => (totals[i] += b))
      const kept = bets[correct]
      bank[p.id] = kept
      const lost = have - kept
      const pts = last ? kept * Number(cfg.multiplier || 1) : 0
      results[p.id] = {
        pts,
        detail: `🪙 ${have} → ${kept}` + (lost ? ` (${lost} tombé${lost > 1 ? 's' : ''})` : '') + (last ? ` · +${pts} pts` : ''),
      }
    }
    return { results, block: { bank }, summary: { counts: totals } }
  },
  Player: ({ round, block, answer, submit, locked, me }) => {
    const have = tokensLeft(block, me.id)
    const keepOneEmpty = round.public.keepOneEmpty !== false
    const [bets, setBets] = useState<number[]>(cleanBets(answer?.data.bets))
    // Mises déjà envoyées (ex. après un rechargement de la page)
    useEffect(() => {
      if (answer) setBets(cleanBets(answer.data.bets))
    }, [answer?.id])
    // Chaque mise est envoyée automatiquement (comme dans l'émission, ce qui est posé à la fin du temps compte)
    const timer = useRef<ReturnType<typeof setTimeout>>()
    const place = (next: number[]) => {
      setBets(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void submit({ bets: next, complete: betsValid(next, have, keepOneEmpty) }), 400)
    }
    useEffect(() => () => clearTimeout(timer.current), [])
    const revealed = round.status === 'revealed'
    const left = have - sum(bets)
    const choices = round.public.choices as string[]
    const kept = revealed ? bets[round.solution?.correct] ?? 0 : 0
    const change = (i: number, d: number) => {
      const n = [...bets]
      n[i] = Math.max(0, n[i] + d)
      if (sum(n) > have) return
      if (keepOneEmpty && n.every((b) => b > 0)) return
      place(n)
    }
    const allIn = (i: number) => {
      const n = [...bets]
      n[i] += left
      if (keepOneEmpty && n.every((b) => b > 0)) return
      place(n)
    }
    if (have <= 0 && !revealed) {
      return (
        <div className="center">
          <div className="huge">💸</div>
          <p>Tu n'as plus de jetons pour cette manche. Regarde les autres tomber !</p>
          <QuestionText>{round.public.text}</QuestionText>
        </div>
      )
    }
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <div className="tokens">
          {revealed ? (
            <>
              🪙 Il te reste <b>{kept}</b> jeton{kept > 1 ? 's' : ''}
            </>
          ) : left > 0 ? (
            <>
              🪙 <b>{left}</b> jeton{left > 1 ? 's' : ''} à placer (sur {have})
            </>
          ) : (
            <>✅ Tous tes jetons sont placés</>
          )}
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
                <button type="button" className="bet-all" disabled={locked || revealed || left <= 0} onClick={() => allIn(i)}>
                  Tout
                </button>
              </span>
            </div>
          ))}
        </div>
        {!revealed && keepOneEmpty && <p className="muted small center">Laisse au moins une réponse sans jeton.</p>}
        {!revealed && left > 0 && <p className="muted small center">Les jetons non placés à la fin du temps tombent.</p>}
        {answer && !locked && !revealed && left === 0 && <Sent>Mises enregistrées, tu peux encore les déplacer</Sent>}
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
            <p className="muted center">Jetons posés sur chaque réponse : seuls ceux de la bonne réponse restent</p>
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
              🪙 Jetons en jeu : {participants.filter((p) => !p.kicked).map((p) => `${p.name} ${tokensLeft(block, p.id)}`).join(' · ')}
            </p>
          </>
        )}
      </>
    )
  },
}
