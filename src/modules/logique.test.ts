import { describe, expect, it } from 'vitest'
import { relativeError } from './echelle'
import { isRight, pointsFor } from './logique'

describe('100% Logique', () => {
  it('compare les réponses libres sans accents ni majuscules, avec variantes', () => {
    const q = { answer: '1 h/1h/une heure' }
    expect(isRight(q, { text: '1H' })).toBe(true)
    expect(isRight(q, { text: 'Une heure' })).toBe(true)
    expect(isRight(q, { text: '2 h' })).toBe(false)
  })
  it('vérifie les propositions par leur texte', () => {
    const q = { choices: ['HÉLÈNE', 'PAUL'], answer: 'Hélène' }
    expect(isRight(q, { choice: 0 })).toBe(true)
    expect(isRight(q, { choice: 1 })).toBe(false)
  })
  it('les questions dures rapportent plus', () => {
    expect(pointsFor(90, 10)).toBe(1)
    expect(pointsFor(1, 10)).toBe(10)
    expect(pointsFor(50, 10)).toBe(5)
  })
})

describe("À l'échelle", () => {
  it("l'écart est relatif : ×2 et ÷2 se valent", () => {
    expect(relativeError(2, 1)).toBeCloseTo(relativeError(0.5, 1))
  })
})
