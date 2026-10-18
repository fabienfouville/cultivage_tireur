import { describe, expect, it } from 'vitest'
import { gambling, tokensLeft } from './gambling'

describe('Gambling', () => {
  const block = { no: 1, module: 'gambling', themeId: 't', themeName: '', questionIds: ['a', 'b'], index: 0, timer: 30, tokensStart: 6, spent: {} } as any
  const players = ['p1', 'p2', 'p3'].map((id) => ({ id, name: id, score: 0 }))
  const q = { id: 'a', module: 'gambling', themeId: 't', text: '?', answers: ['a', 'b', 'c', 'd'], correct: 1 } as any
  const ans = (pid: string, bets: number[]) => ({ id: `1_${pid}`, seq: 1, pid, name: pid, at: null, data: { bets } })

  it('les mises gagnantes rapportent des points, les jetons misés sont dépensés', async () => {
    const r = await gambling.score({ q, answers: [ans('p1', [0, 2, 0, 1])], round: {} as any, block, cfg: { timer: 30, tokensPerQuestion: 3, multiplier: 1 }, participants: players, verdicts: {} })
    expect(r.results.p1.pts).toBe(2)
    expect(r.block!.spent!.p1).toBe(3)
  })
  it('sans mise, on perd sa part de la question', async () => {
    const r = await gambling.score({ q, answers: [], round: {} as any, block, cfg: { timer: 30, tokensPerQuestion: 3, multiplier: 1 }, participants: players, verdicts: {} })
    expect(r.block!.spent!.p2).toBe(3)
    expect(tokensLeft({ ...block, spent: r.block!.spent }, 'p2')).toBe(3)
  })
  it('un joueur arrivé en cours de manche a tous ses jetons', () => {
    expect(tokensLeft(block, 'nouveau')).toBe(6)
  })
})
