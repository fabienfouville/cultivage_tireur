import { describe, expect, it } from 'vitest'
import { resolveCards } from './cards'

describe('resolveCards', () => {
  it('Confiant : +5 seulement pour le 1er (ex-aequo compris)', () => {
    const r = resolveCards(
      { a: { card: 'confiant' }, b: { card: 'confiant' }, c: { card: 'confiant' } },
      { a: 10, b: 10, c: 3 },
      ['a', 'b', 'c'],
    )
    expect(r.a.pts).toBe(5)
    expect(r.b.pts).toBe(5)
    expect(r.c.pts).toBe(0)
  })
  it('Duel : +3 si on fait strictement mieux que la cible, sinon −3', () => {
    const r = resolveCards({ a: { card: 'duel', target: 'b' }, b: { card: 'duel', target: 'a' } }, { a: 4, b: 4 }, ['a', 'b'])
    expect(r.a.pts).toBe(-3)
    expect(r.b.pts).toBe(-3)
  })
  it('Personne ne marque : Confiant raté', () => {
    expect(resolveCards({ a: { card: 'confiant' } }, {}, ['a']).a.pts).toBe(0)
  })
})
