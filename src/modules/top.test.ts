import { describe, expect, it } from 'vitest'
import { top } from './top'

const q = { id: 'q', module: 'top', themeId: 't', text: 'Top 3', answers: ['Chine', 'Inde', 'États-Unis'] } as any
const ans = (pid: string, items: string[]) => ({ id: pid, seq: 1, pid, name: pid, at: null, data: { items } })

describe('Le Top', () => {
  it('compte toutes les propositions validées d’un tour', async () => {
    const answers = [ans('a', ['Inde', 'Chine', 'Brésil']), ans('b', ['Inde'])]
    const items = top.validationItems!({ q, answers, round: { tour: 1, public: { n: 3 } } as any, block: {} as any, cfg: { timer: 20 }, participants: [] })
    const verdicts = Object.fromEntries(items.filter((i) => i.suggested).map((i) => [i.key, true]))
    const r = await top.score({ q, answers, verdicts, round: { tour: 1, public: { n: 3 } } as any, block: {} as any, cfg: { timer: 20, wrong: 1 }, participants: [] })
    expect(r.results.a.pts).toBe(3 + 2 - 1)
    expect(r.results.b.pts).toBe(2)
    expect(Object.keys(r.state!.found)).toEqual(['0', '1'])
  })
  it('ne redonne pas de points pour un élément trouvé à un tour précédent', async () => {
    const answers = [ans('a', ['Chine', 'États-Unis'])]
    const round = { tour: 2, public: { n: 3 }, state: { found: { 0: { label: 'Chine', by: ['b'], tour: 1 } } } } as any
    const verdicts = { '2|etats unis': true, '0|chine': true }
    const r = await top.score({ q, answers, verdicts, round, block: {} as any, cfg: { timer: 20, wrong: 0 }, participants: [] })
    expect(r.results.a.pts).toBe(1)
  })
})
