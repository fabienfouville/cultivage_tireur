import { Locked, QuestionText, RevealList, namesOf, parsePoints } from './common'
import type { ModuleDef } from './types'

const alive = (block: { alive?: Record<string, boolean> }, pid: string) => block.alive?.[pid] !== false

export const vfSurvie: ModuleDef = {
  key: 'vf-survie',
  name: 'VF Survie',
  icon: '⚔️',
  tagline: 'Élimination progressive',
  rules: 'Vrai ou Faux ? Une erreur (ou pas de réponse) et tu es éliminé. Les questions rapportent de plus en plus.',
  defaults: { timer: 10, pointsScheme: '1,1,2,2,3,3,4,4,5,5' },
  configFields: [
    { key: 'pointsScheme', label: 'Points question par question', type: 'text', help: 'ex : 1,1,2,2,3,3,4,4,5,5' },
  ],
  questionFields: [
    { key: 'text', label: 'Affirmation', type: 'textarea' },
    { key: 'correct', label: "C'est vrai", type: 'bool' },
    { key: 'order', label: 'Ordre dans la liste', type: 'number', optional: true },
  ],
  ordered: true,
  summary: (q) => (q.correct ? 'VRAI' : 'FAUX'),
  publicPayload: (q) => ({ text: q.text }),
  solution: (q) => ({ correct: !!q.correct, label: q.correct ? 'VRAI' : 'FAUX' }),
  canAnswer: (block, pid) => alive(block, pid),
  blockOver: (block) => !!block.alive && Object.keys(block.alive).length > 0 && !Object.values(block.alive).some(Boolean),
  initBlock: (_block, participants) => ({
    block: { alive: Object.fromEntries(participants.filter((p) => !p.kicked).map((p) => [p.id, true])) },
  }),
  score: ({ q, answers, cfg, round, block, participants }) => {
    const scheme = parsePoints(cfg.pointsScheme, [1])
    const pts = scheme[Math.min(round.index, scheme.length - 1)]
    const byPid = new Map(answers.map((a) => [a.pid, a]))
    const results: Record<string, { pts: number; detail?: string }> = {}
    const nextAlive = { ...(block.alive ?? {}) }
    let vrai = 0
    let faux = 0
    for (const p of participants) {
      if (p.kicked || !alive(block, p.id)) continue
      const a = byPid.get(p.id)
      if (a?.data.value === true) vrai++
      if (a?.data.value === false) faux++
      if (a && a.data.value === !!q.correct) {
        results[p.id] = { pts }
        nextAlive[p.id] = true
      } else {
        results[p.id] = { pts: 0, detail: '💀 éliminé' }
        nextAlive[p.id] = false
      }
    }
    return {
      results,
      block: { alive: nextAlive },
      summary: { vrai, faux, survivors: Object.values(nextAlive).filter(Boolean).length },
    }
  },
  Player: ({ round, block, me, answer, submit, locked }) => {
    const revealed = round.status === 'revealed'
    if (!alive(block, me.id) && !(revealed && round.results?.[me.id])) {
      return (
        <div className="center">
          <div className="huge">💀</div>
          <p>Tu es éliminé de cette manche. Regarde les survivants !</p>
        </div>
      )
    }
    const v = answer?.data.value
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <div className="vf">
          {[true, false].map((b) => (
            <button
              key={String(b)}
              type="button"
              className={
                'vf-btn ' +
                (b ? 'vf-true' : 'vf-false') +
                (v === b ? ' choice-selected' : '') +
                (revealed && round.solution?.correct === b ? ' choice-correct' : '') +
                (revealed && round.solution?.correct !== b ? ' choice-dim' : '')
              }
              disabled={locked || revealed}
              onClick={() => submit({ value: b })}
            >
              {b ? 'VRAI' : 'FAUX'}
            </button>
          ))}
        </div>
        {locked && !revealed && <Locked />}
      </>
    )
  },
  Screen: ({ round, block, participants }) => {
    const living = participants.filter((p) => !p.kicked && alive(block, p.id))
    return (
      <>
        <QuestionText big>{round.public.text}</QuestionText>
        {round.status === 'revealed' ? (
          <>
            <div className={'vf-answer ' + (round.solution?.correct ? 'vf-true' : 'vf-false')}>{round.solution?.label}</div>
            <p className="muted">
              {round.summary?.vrai ?? 0} ont dit VRAI · {round.summary?.faux ?? 0} ont dit FAUX
            </p>
            <RevealList round={round} names={namesOf(participants)} />
          </>
        ) : (
          <p className="survivors">
            🛡️ Survivants : {living.map((p) => p.name).join(', ') || 'personne'}
          </p>
        )}
      </>
    )
  },
}
