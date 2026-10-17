import type { CardKey, CardPlay } from '../types'

/** Le temps de réponse d'un joueur visé par la Tortue est réduit de 30 % */
export const TORTUE_FACTOR = 0.7

export const CARDS: Record<CardKey, { icon: string; name: string; desc: string; needsTarget?: boolean }> = {
  tortue: { icon: '🐢', name: 'Tortue', desc: 'Le joueur visé a 30 % de temps en moins sur tout le module.', needsTarget: true },
  confiant: { icon: '😤', name: 'Confiant', desc: '+5 points si tu termines 1er du module.' },
  duel: { icon: '⚔️', name: 'Duel', desc: 'Vise un joueur : si tu fais mieux que lui sur le module +3, sinon −3.', needsTarget: true },
  bouclier: { icon: '🛡️', name: 'Bouclier', desc: 'Annule une Tortue jouée contre toi sur ce module.' },
}

export const CARD_KEYS = Object.keys(CARDS) as CardKey[]

/** Bonus/malus de fin de module. `totals` = points de chacun sur le module */
export function resolveCards(
  cards: Record<string, CardPlay>,
  totals: Record<string, number>,
  players: string[],
): Record<string, { pts: number; detail: string }> {
  const out: Record<string, { pts: number; detail: string }> = {}
  const score = (pid: string) => totals[pid] ?? 0
  const best = Math.max(0, ...players.map(score))
  for (const [pid, play] of Object.entries(cards)) {
    if (play.card === 'confiant') {
      const win = score(pid) === best && best > 0
      out[pid] = { pts: win ? 5 : 0, detail: win ? '😤 Confiant réussi : +5' : '😤 Confiant raté' }
    } else if (play.card === 'duel' && play.target) {
      const win = score(pid) > score(play.target)
      out[pid] = { pts: win ? 3 : -3, detail: win ? '⚔️ Duel gagné : +3' : '⚔️ Duel perdu : −3' }
    }
  }
  return out
}
