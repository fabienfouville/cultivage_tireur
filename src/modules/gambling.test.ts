import { describe, expect, it } from 'vitest'
import { betsValid, gambling, tokensLeft } from './gambling'

describe('Money Drop', () => {
  const block = { no: 1, module: 'gambling', themeId: 't', themeName: '', questionIds: ['a', 'b'], index: 0, timer: 30, tokensStart: 20, bank: {} } as any
  const players = ['p1', 'p2', 'p3'].map((id) => ({ id, name: id, score: 0 }))
  const q = { id: 'a', module: 'gambling', themeId: 't', text: '?', answers: ['a', 'b', 'c', 'd'], correct: 1 } as any
  const cfg = { timer: 30, stock: 20, multiplier: 1, keepOneEmpty: 1 }
  const ans = (pid: string, bets: number[]) => ({ id: `1_${pid}`, seq: 1, pid, name: pid, at: null, data: { bets } })
  const score = (answers: any[], b = block, round = { index: 0, total: 2 }) =>
    gambling.score({ q, answers, round: round as any, block: b, cfg, participants: players, verdicts: {} }) as any

  it('seuls les jetons de la bonne réponse restent ; pas de points avant la dernière question', async () => {
    const r = await score([ans('p1', [5, 12, 3, 0])])
    expect(r.block.bank.p1).toBe(12)
    expect(r.results.p1.pts).toBe(0)
  })
  it('les jetons non placés tombent, sans mise on perd tout', async () => {
    const r = await score([ans('p1', [0, 10, 0, 0])])
    expect(r.block.bank.p1).toBe(10)
    expect(r.block.bank.p2).toBe(0)
  })
  it('à la dernière question, chaque jeton restant rapporte des points', async () => {
    const b = { ...block, bank: { p1: 12, p2: 0, p3: 8 } }
    const r = await score([ans('p1', [0, 12, 0, 0]), ans('p3', [8, 0, 0, 0])], b, { index: 1, total: 2 })
    expect(r.results.p1.pts).toBe(12)
    expect(r.results.p3.pts).toBe(0)
    expect(r.results.p2).toBeUndefined()
  })
  it('on ne peut pas miser plus que ce qu’on a', async () => {
    const r = await score([ans('p1', [30, 0, 0, 0])])
    expect(r.block.bank.p1).toBe(0)
  })
  it('règles de mise : tout placer et laisser une réponse vide', () => {
    expect(betsValid([5, 5, 10, 0], 20, true)).toBe(true)
    expect(betsValid([5, 5, 5, 5], 20, true)).toBe(false)
    expect(betsValid([5, 5, 5, 5], 20, false)).toBe(true)
    expect(betsValid([5, 5, 0, 0], 20, true)).toBe(false)
  })
  it('stock de départ, joueurs sans jetons, fin de manche quand tout le monde est à 0', () => {
    expect(tokensLeft(block, 'nouveau')).toBe(20)
    expect(gambling.canAnswer!({ ...block, bank: { p1: 0 } }, 'p1')).toBe(false)
    expect(gambling.blockOver!({ ...block, bank: { p1: 0, p2: 0 } })).toBe(true)
    expect(gambling.blockOver!({ ...block, bank: { p1: 0, p2: 3 } })).toBe(false)
  })
})
