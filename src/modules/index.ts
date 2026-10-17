import type { ModuleKey } from '../types'
import { blindtest } from './blindtest'
import { cash } from './cash'
import { duoCarreCash } from './duo-carre-cash'
import { estimation } from './estimation'
import { gambling } from './gambling'
import { geoloc } from './geoloc'
import { pixel } from './pixel'
import { qcm } from './qcm'
import { theme } from './theme'
import { top } from './top'
import type { ModuleConfig, ModuleDef } from './types'
import { vfSurvie } from './vf-survie'

/**
 * Tous les jeux disponibles, dans l'ordre d'affichage.
 * Pour ajouter un jeu : créer src/modules/<jeu>.tsx (voir CLAUDE.md) et l'ajouter ici.
 */
export const MODULES: ModuleDef[] = [qcm, vfSurvie, estimation, cash, pixel, theme, geoloc, blindtest, gambling, duoCarreCash, top]

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleKey, ModuleDef>

export function getModule(key: string): ModuleDef {
  const m = MODULE_BY_KEY[key as ModuleKey]
  if (!m) throw new Error(`Module inconnu : ${key}`)
  return m
}

/** Config d'un module = valeurs par défaut du code + réglages enregistrés dans config/modules */
export function moduleConfig(key: string, stored: Record<string, any> | null | undefined): ModuleConfig {
  const m = getModule(key)
  const s = stored?.[key] ?? {}
  // L'ancienne app stockait la durée dans `timerDefault`
  const timer = Number(s.timer ?? s.timerDefault ?? m.defaults.timer)
  return { ...m.defaults, ...s, timer }
}
