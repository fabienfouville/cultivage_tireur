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
  it('le classement se fait sur l’écart absolu (ISS : 109 m)', async () => {
    const { echelle } = await import('./echelle')
    const ans = (pid: string, value: number, at: number) => ({ id: pid, seq: 1, pid, name: pid, at: { toMillis: () => at }, data: { value } })
    const r = (await echelle.score({ q: { answer: 109 } as any, answers: [ans('rouge', 202, 1), ans('loose', 52, 2), ans('fab', 274, 3)] as any, cfg: { timer: 25, podium: '5,3,1' }, round: {} as any, block: {} as any, participants: [], verdicts: {} })) as any
    expect(r.results.loose.pts).toBe(5)
    expect(r.results.rouge.pts).toBe(3)
    expect(r.results.loose.detail).toBe('52 m (écart 57 m)')
  })
})

describe('packs 100% Logique', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { normalize } = await import('../lib/normalize')
  const dir = new URL('../../content/packs/', import.meta.url)
  const packs = readdirSync(dir)
    .filter((f) => f.startsWith('logique-'))
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')))
  for (const p of packs) {
    it(`${p.id} : réponses utilisables, de 50 % à 2 %`, () => {
      for (const q of p.questions) {
        const where = `${p.id} › ${q.text}`
        expect(q.percent, where).toBeLessThanOrEqual(50)
        // Une variante vide (ex. « un ») ne pourrait jamais être trouvée
        for (const v of String(q.answer).split('/')) expect(normalize(v), `${where} : « ${v} »`).not.toBe('')
        if (q.choices?.length) expect(q.choices.some((c: string) => isRight(q, { choice: q.choices.indexOf(c) })), where).toBe(true)
        else expect(isRight(q, { text: String(q.answer).split('/')[0] }), where).toBe(true)
      }
    })
  }
})
