import { describe, expect, it } from 'vitest'
import { pixelColumns } from './PixelImage'

describe('pixelColumns', () => {
  const at = (p: number) => pixelColumns(p, 900, 5, 2.5)
  it('part très pixellisé et finit net', () => {
    expect(at(0)).toBe(5)
    expect(at(1)).toBe(900)
  })
  it('reste illisible pendant la première moitié du temps', () => {
    expect(at(0.5)).toBeLessThan(15)
  })
  it('se révèle surtout à la fin', () => {
    expect(at(0.75) - at(0.5)).toBeLessThan(at(1) - at(0.9))
  })
})

describe('paliers du Pixel', async () => {
  const { progress } = await import('../modules/pixel')
  it("ne change l'image que toutes les 3 secondes", () => {
    // 30 s au total : de 0 à 2,9 s écoulées → même image
    expect(progress('answering', 30, 30, 3)).toBe(0)
    expect(progress('answering', 27.1, 30, 3)).toBe(0)
    expect(progress('answering', 27, 30, 3)).toBeCloseTo(0.1)
    expect(progress('answering', 25, 30, 3)).toBeCloseTo(0.1)
    expect(progress('revealed', 0, 30, 3)).toBe(1)
  })
})
