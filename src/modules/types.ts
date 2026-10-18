import type { FC } from 'react'
import type { Answer, Block, ModuleKey, Participant, Question, Round, Session } from '../types'

export type ModuleConfig = Record<string, any> & { timer: number }

export interface ConfigField {
  key: string
  label: string
  type: 'number' | 'text'
  help?: string
}

/** Champ du formulaire d'édition d'une question dans l'admin */
export type QuestionField =
  | { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'url'; placeholder?: string; optional?: boolean }
  | { key: string; label: string; type: 'choices4'; correctKey: string } // 4 réponses + index de la bonne
  | { key: string; label: string; type: 'list'; placeholder?: string } // liste ordonnée (Le Top)
  | { key: string; label: string; type: 'bool' }
  | { key: string; label: string; type: 'image'; optional?: boolean }
  | { key: string; label: string; type: 'audio' }
  | { key: string; label: string; type: 'latlng' }

export interface ScoreContext {
  q: Question
  answers: Answer[]
  round: Round
  block: Block
  cfg: ModuleConfig
  participants: Participant[]
  /** Validation manuelle (clé → bonne réponse ?) */
  verdicts: Record<string, boolean>
}

export interface ScoreResult {
  results: Record<string, { pts: number; detail?: string }>
  /** Données publiques affichées à la révélation (répartition des votes, classement…) */
  summary?: Record<string, any>
  /** Mise à jour du bloc (ex. joueurs éliminés en VF Survie) */
  block?: Partial<Block>
  /** Mise à jour de l'état du round persistant entre les tours (Le Top) */
  state?: Record<string, any>
  /** Mises à jour des participants (ex. jetons du Gambling) */
  participants?: Record<string, Partial<Participant>>
}

export interface ValidationItem {
  /** clé stockée dans round.verdicts */
  key: string
  label: string
  /** nb de joueurs ayant donné cette réponse */
  count: number
  /** joueurs ayant donné cette réponse */
  pids?: string[]
  suggested: boolean
  /** regroupement dans l'écran de validation (ex. Artiste / Titre) */
  group?: string
}

export interface PlayerProps {
  session: Session
  round: Round
  block: Block
  me: Participant
  answer: Answer | null
  submit: (data: Record<string, any>) => Promise<void>
  /** temps écoulé (ou carte Tortue) : on ne peut plus répondre */
  locked: boolean
  /** secondes restantes pour ce joueur */
  left: number
}

export interface ScreenProps {
  session: Session
  round: Round
  block: Block
  participants: Participant[]
  left: number
}

export interface ModuleDef {
  key: ModuleKey
  name: string
  icon: string
  /** Sous-titre sur la grille des modules */
  tagline: string
  /** Règle expliquée aux joueurs */
  rules: string
  defaults: ModuleConfig
  configFields: ConfigField[]
  questionFields: QuestionField[]
  /** Le thème a une carte (géoloc) */
  themeHasMap?: boolean
  /** Il faut valider à la main avant de révéler */
  manual?: boolean
  /** La question se joue en plusieurs tours (Le Top) */
  multiTour?: boolean
  /** Une question de liste se joue dans l'ordre (VF Survie) */
  ordered?: boolean
  /** Chaque joueur peut envoyer plusieurs réponses : pas d'arrêt automatique quand tout le monde a répondu */
  multiAnswer?: boolean
  /** La réponse est-elle complète (pour l'arrêt automatique) ? Par défaut : oui dès qu'elle existe */
  isComplete?: (data: Record<string, any>) => boolean
  /** Texte lisible d'une réponse (régie, correction) */
  describe?: (data: Record<string, any>, round: Round) => string
  summary: (q: Question) => string
  /** Ce que les joueurs voient pendant la question — JAMAIS la solution */
  publicPayload: (q: Question, ctx: { block: Block; cfg: ModuleConfig; state?: Record<string, any> }) => Record<string, any>
  solution: (q: Question) => Record<string, any>
  /** Réponses à valider à la main (modules `manual`) */
  validationItems?: (ctx: Omit<ScoreContext, 'verdicts'>) => ValidationItem[]
  score: (ctx: ScoreContext) => ScoreResult | Promise<ScoreResult>
  /** Le joueur peut-il répondre (ex. éliminé en VF Survie) */
  canAnswer?: (block: Block, pid: string) => boolean
  /** Le bloc est-il fini avant la dernière question (ex. tout le monde éliminé) */
  blockOver?: (block: Block) => boolean
  /** Initialisation du bloc (ex. jetons du Gambling) */
  initBlock?: (block: Block, participants: Participant[], cfg: ModuleConfig) => {
    block?: Partial<Block>
    participants?: Record<string, Partial<Participant>>
  }
  Player: FC<PlayerProps>
  Screen: FC<ScreenProps>
}
