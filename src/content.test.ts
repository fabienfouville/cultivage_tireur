/**
 * Vérifie tous les packs de content/packs/ : bon format pour chaque module, pas de doublons,
 * coordonnées et pays cohérents. À lancer après avoir ajouté un pack : `npm test`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { distanceToCountryKm } from './lib/geo'
import { normalize } from './lib/normalize'
import { MODULE_BY_KEY, bankOf } from './modules'
import type { Pack } from './pages/admin/PacksTab'

const dir = new URL('../content/packs/', import.meta.url)
const packs: Pack[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')))

describe('packs de contenu', () => {
  it('ont des identifiants uniques', () => {
    const ids = packs.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const pack of packs) {
    describe(pack.id, () => {
      const mod = MODULE_BY_KEY[pack.module]

      it('utilise un module existant', () => expect(mod, pack.module).toBeTruthy())

      it('respecte le format du module', () => {
        expect(pack.questions.length).toBeGreaterThan(0)
        for (const q of pack.questions) {
          const where = `${pack.id} › ${q.text}`
          expect(typeof q.text, where).toBe('string')
          for (const f of mod.questionFields) {
            if ('optional' in f && f.optional) continue
            if (f.type === 'choices4') {
              const arr = q[f.key] as string[]
              expect(arr, where).toHaveLength(4)
              expect(new Set(arr.map(normalize)).size, `${where} : réponses en double`).toBe(4)
              expect(q[f.correctKey], where).toBeGreaterThanOrEqual(0)
              expect(q[f.correctKey], where).toBeLessThan(4)
            } else if (f.type === 'list') {
              expect((q[f.key] as string[]).length, where).toBeGreaterThanOrEqual(2)
            } else if (f.type === 'latlng') {
              expect(Math.abs(q.lat as number), where).toBeLessThanOrEqual(90)
              expect(Math.abs(q.lng as number), where).toBeLessThanOrEqual(180)
            } else if (f.type === 'number') {
              expect(typeof q[f.key], where).toBe('number')
            } else if (f.type === 'bool') {
              expect(typeof q[f.key], where).toBe('boolean')
            } else {
              expect(String(q[f.key] ?? '').trim(), `${where} : champ « ${f.label} » vide`).not.toBe('')
            }
          }
        }
      })

      it("n'a pas deux fois la même question", () => {
        // Certains jeux répètent la même consigne : ce sont alors les indices, événements, image ou chanson qui comptent
        const texts = pack.questions.map((q) =>
          normalize(String(q.text) + ' ' + JSON.stringify(q.clues ?? q.events ?? q.imageUrl ?? q.answerHintTitle ?? '')),
        )
        expect(new Set(texts).size).toBe(texts.length)
      })

      it('les images du site citées existent (public/)', () => {
        for (const q of pack.questions)
          for (const v of Object.values(q))
            if (typeof v === 'string' && /^\/[\w/-]+\.(webp|png|jpe?g|svg)$/.test(v))
              expect(existsSync(new URL('../public' + v, import.meta.url)), `${pack.id} › ${v}`).toBe(true)
      })

      if (pack.module === 'geoloc') {
        it('les pays (isoNum) existent et contiennent le point de la réponse', async () => {
          for (const q of pack.questions.filter((x) => x.isoNum != null)) {
            expect(await distanceToCountryKm(q.isoNum, q.lat as number, q.lng as number), String(q.text)).toBe(0)
          }
        })
      }
    })
  }
})

describe('grands jeux prêts à l’emploi', () => {
  const gdir = new URL('../content/grandjeux/', import.meta.url)
  const files = readdirSync(gdir).filter((f) => f.endsWith('.json'))
  for (const f of files) {
    const gj = JSON.parse(readFileSync(new URL(f, gdir), 'utf8'))
    it(`${gj.id} : chaque jeu pointe vers un pack de la bonne banque`, () => {
      expect(gj.slots.length).toBeGreaterThan(0)
      for (const s of gj.slots) {
        const pack = packs.find((p) => p.id === s.packId)
        expect(pack, s.packId).toBeTruthy()
        expect(bankOf(s.module), `${s.packId} pour ${s.module}`).toBe(pack!.module)
        expect(s.questionCount, s.packId).toBeLessThanOrEqual(pack!.questions.length)
        if (s.extraPackId) {
          const extra = packs.find((p) => p.id === s.extraPackId)
          expect(extra, s.extraPackId).toBeTruthy()
          expect(bankOf(s.module), `${s.extraPackId} pour ${s.module}`).toBe(extra!.module)
          expect(s.extraCount ?? 1, s.extraPackId).toBeLessThanOrEqual(extra!.questions.length)
        }
      }
    })
  }
})
