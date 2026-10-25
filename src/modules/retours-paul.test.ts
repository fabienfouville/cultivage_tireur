import { describe, expect, it } from 'vitest'
import { blindtest } from './blindtest'
import { formatTyping, parseTyping } from './estimation'
import { theme } from './theme'
import { proposalLimit, top } from './top'
import { vfSurvie } from './vf-survie'

const ans = (pid: string, data: Record<string, any>, at = 0) => ({ id: pid, seq: 1, pid, name: pid, at: { toMillis: () => at } as any, data })
const players = ['a', 'b', 'c'].map((id) => ({ id, name: id, score: 0 }) as any)

describe('VF Survie', () => {
  it('sans réponse : pas de point mais pas éliminé', async () => {
    const block = { alive: { a: true, b: true, c: true } } as any
    const r = await vfSurvie.score({ q: { correct: true } as any, answers: [ans('a', { value: true }), ans('b', { value: false })], round: { index: 0 } as any, block, cfg: { timer: 10 }, participants: players, verdicts: {} })
    expect(r.block!.alive).toEqual({ a: true, b: false, c: true })
    expect(r.results.c.pts).toBe(0)
  })
})

describe('Estimation', () => {
  it('affiche les milliers pendant la saisie', () => {
    expect(formatTyping('1234567')).toBe('1 234 567')
    expect(formatTyping('1234567,5')).toBe('1 234 567,5')
    expect(formatTyping('12.5')).toBe('12,5')
    expect(parseTyping('1 234 567,5')).toBe(1234567.5)
  })
})

describe('Thème', () => {
  it('3 points pour une réponse trouvée seul', async () => {
    const answers = [ans('a', { items: ['Lion', 'Gnou'] }), ans('b', { items: ['lion'] })]
    const r = await theme.score({ q: {} as any, answers, round: {} as any, block: {} as any, cfg: { timer: 45, points: 1, solo: 3 }, participants: players, verdicts: { lion: true, gnou: true } })
    expect(r.results.a.pts).toBe(1 + 3)
    expect(r.results.b.pts).toBe(1)
  })
})

describe('Blind Test', () => {
  it('3 / 2 / 1 pour les plus rapides, 1 point pour les autres bonnes réponses', async () => {
    const answers = ['a', 'b', 'c', 'd'].map((pid, i) => ans(pid, { author: 'Cabrel', title: 'x' }, i))
    const r = await blindtest.score({ q: {} as any, answers, round: {} as any, block: {} as any, cfg: { timer: 30, podium: '3,2,1', others: 1 }, participants: players, verdicts: { 'a:cabrel': true } })
    expect(['a', 'b', 'c', 'd'].map((p) => r.results[p].pts)).toEqual([3, 2, 1, 1])
  })
})

describe('Le Top', () => {
  it('autant de propositions que d’éléments restant à trouver', async () => {
    const round = { tour: 2, public: { n: 3 }, state: { found: { 0: { label: 'Chine', by: [], tour: 1 } } } } as any
    expect(proposalLimit(round)).toBe(2)
    const q = { answers: ['Chine', 'Inde', 'États-Unis'] } as any
    const r = await top.score({ q, answers: [ans('a', { items: ['x', 'y', 'Inde'] })], round, block: {} as any, cfg: { timer: 20, wrong: 0 }, participants: players, verdicts: { '1|inde': true } })
    expect(r.results.a.pts).toBe(0) // « Inde » est la 3e proposition : au-delà de la limite
  })
})
