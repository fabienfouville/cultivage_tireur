import { describe, expect, it } from 'vitest'
import { wellPlaced } from './chronologie'
import { pointsAtClue, visibleClues } from './quisuisje'

describe('Chronologie', () => {
  const events = ['a', 'b', 'c', 'd']
  it('compte les événements bien placés', () => {
    expect(wellPlaced(['a', 'b', 'c', 'd'], events)).toBe(4)
    expect(wellPlaced(['b', 'a', 'c', 'd'], events)).toBe(2)
    expect(wellPlaced(undefined, events)).toBe(0)
  })
})

describe('Qui suis-je ?', () => {
  it('dévoile un indice à intervalles réguliers', () => {
    expect(visibleClues('answering', 50, 50, 5)).toBe(1)
    expect(visibleClues('answering', 39, 50, 5)).toBe(2)
    expect(visibleClues('answering', 1, 50, 5)).toBe(5)
    expect(visibleClues('answering', -3, 50, 5)).toBe(5)
    expect(visibleClues('revealed', 50, 50, 5)).toBe(5)
  })
  it('donne moins de points aux indices tardifs', () => {
    expect(pointsAtClue(1, [5, 4, 3, 2, 1])).toBe(5)
    expect(pointsAtClue(5, [5, 4, 3, 2, 1])).toBe(1)
    expect(pointsAtClue(9, [5, 4, 3, 2, 1])).toBe(1)
  })
})
