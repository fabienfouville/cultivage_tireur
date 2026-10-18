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
