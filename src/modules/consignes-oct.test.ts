import { describe, expect, it } from 'vitest'
import { CARDS_ON } from '../engine/cards'
import { echelle } from './echelle'
import { geoloc } from './geoloc'
import { logique } from './logique'
import type { Block, Question } from '../types'

const block = { no: 1, module: 'echelle', themeId: '', themeName: '', questionIds: [], index: 0, timer: 25 } as unknown as Block
const q = (o: Record<string, unknown>) => ({ id: 'x', module: 'echelle', themeId: 't', text: '', ...o }) as unknown as Question

describe('consignes d’octobre', () => {
  it('Géoloc ne s’arrête pas quand tout le monde a répondu', () => {
    expect(geoloc.multiAnswer).toBe(true)
  })

  it('100% Logique : une erreur n’élimine plus', () => {
    expect(logique.initBlock).toBeUndefined()
    expect(logique.canAnswer).toBeUndefined()
    const participants = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as any
    const answers = [
      { pid: 'a', data: { text: 'faux' } },
      { pid: 'b', data: { text: '7' } },
    ] as any
    const out = logique.score({ q: q({ answer: '7', percent: 50 }), answers, cfg: { maxPoints: 10 }, block, participants } as any) as any
    expect(out.block).toBeUndefined()
    expect(out.results.a.pts).toBe(0)
    expect(out.results.b.pts).toBeGreaterThan(0)
  })

  it('Les cartes sont désactivées', () => {
    expect(CARDS_ON).toBe(false)
  })

  it('À l’échelle compare au dernier objet deviné', () => {
    const first = q({ refName: 'Pikachu', refHeight: 0.4, targetName: 'Tortank', answer: 1.6, targetImage: '/t.webp' })
    const second = q({ refName: 'Pikachu', refHeight: 0.4, targetName: 'Arcanin', answer: 1.9 })
    expect(echelle.publicPayload(first, { block, cfg: { timer: 25 } }).refName).toBe('Pikachu')
    const p = echelle.publicPayload(second, { block, cfg: { timer: 25 }, prev: first })
    expect(p).toMatchObject({ refName: 'Tortank', refHeight: 1.6, refImage: '/t.webp' })
    expect(p.answer).toBeUndefined()
    // Écart trop grand pour le curseur : on garde la référence de la question
    const far = q({ refName: 'Humain', refHeight: 1.75, targetName: 'Tour Eiffel', answer: 330 })
    expect(echelle.publicPayload(far, { block, cfg: { timer: 25 }, prev: first }).refName).toBe('Humain')
  })
})

describe('podium de fin de manche', () => {
  it('3 marches dans l’ordre 2e · 1er · 3e, ex aequo sur la même marche, sans ceux à 0', async () => {
    const { podiumSteps } = await import('../components/BlockResults')
    const ps = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase() })) as any
    const steps = podiumSteps(ps, { a: 5, b: 9, c: 5, d: 2, e: 0 })
    // B 1er, A et C 2es ex aequo, D 4e : pas de 3e marche
    expect(steps.map((s) => s.rank)).toEqual([2, 1])
    expect(steps.find((s) => s.rank === 1)!.names).toEqual(['B'])
    expect(steps.find((s) => s.rank === 2)!.names).toEqual(['A', 'C'])
    expect(steps.some((s) => s.names.includes('E'))).toBe(false)
    expect(podiumSteps(ps, {})).toEqual([])
  })
})

describe('réponse affichée (Cash, Pixel)', () => {
  it('ne garde que la première variante, sans couper « 3/2 »', async () => {
    const { firstVariant } = await import('./common')
    expect(firstVariant('La Grande Vague de Kanagawa (Hokusai)/La Grande Vague')).toBe('La Grande Vague de Kanagawa (Hokusai)')
    expect(firstVariant('Clochette / Fée Clochette')).toBe('Clochette')
    expect(firstVariant('1 si on prend 3/2 = 1,5')).toBe('1 si on prend 3/2 = 1,5')
    expect(firstVariant(undefined)).toBe('')
  })
})
