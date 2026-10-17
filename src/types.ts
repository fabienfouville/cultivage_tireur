import type { Timestamp } from 'firebase/firestore'

export type ModuleKey =
  | 'qcm'
  | 'vf-survie'
  | 'estimation'
  | 'cash'
  | 'pixel'
  | 'theme'
  | 'geoloc'
  | 'blindtest'
  | 'gambling'
  | 'duo-carre-cash'
  | 'top'

/** themes/{id} */
export interface Theme {
  id: string
  module: ModuleKey
  name: string
  mapId?: string
  /** Pack de contenu importé (content/packs/*.json) d'où vient ce thème */
  packId?: string
  createdAt?: unknown
}

/** questions/{id} — les champs en plus dépendent du module */
export interface Question {
  id: string
  module: ModuleKey
  themeId: string
  text: string
  order?: number
  [field: string]: unknown
}

/** Un bloc = une série de questions d'un même module (un "slot" du Grand Jeu ou un tirage en roue libre) */
export interface Block {
  no: number
  module: ModuleKey
  themeId: string
  themeName: string
  /** Géoloc : fond de carte du thème */
  mapId?: string
  questionIds: string[]
  index: number
  timer: number
  /** index du slot dans le Grand Jeu */
  slot?: number
  /** joueurs ralentis (carte Tortue) pour tout le bloc */
  slowed?: string[]
  /** cartes jouées pour ce bloc : pid → carte */
  cards?: Record<string, CardPlay>
  /** gambling : jetons de départ */
  tokensStart?: number
  /** vf-survie : pid → encore en vie */
  alive?: Record<string, boolean>
}

export type RoundStatus = 'answering' | 'validating' | 'revealed'

export interface Round {
  seq: number
  module: ModuleKey
  qid: string
  index: number
  total: number
  status: RoundStatus
  startedAt: Timestamp | null
  /** secondes */
  duration: number
  /** Ce que les joueurs ont le droit de voir pendant la question (jamais la solution) */
  public: Record<string, any>
  /** Rempli à la révélation */
  solution?: Record<string, any>
  /** pid → points gagnés sur cette question + détail affichable */
  results?: Record<string, { pts: number; detail?: string }>
  /** Données publiques de la révélation (répartition des votes, classement…) */
  summary?: Record<string, any>
  /** pids des joueurs qui ont répondu (tenu à jour par l'admin, visible de tous) */
  answered?: string[]
  /** Validation manuelle : clé normalisée → bonne réponse ? */
  verdicts?: Record<string, boolean>
  /** Le Top : numéro du tour */
  tour?: number
  /** État propre au module qui persiste entre les tours */
  state?: Record<string, any>
}

export type Phase = 'lobby' | 'pick' | 'cards' | 'play' | 'blockResults' | 'final'

export interface GrandJeuSlot {
  module: ModuleKey
  themeId: string
  themeName: string
  questionCount: number
  timer: number
}

export interface GrandJeu {
  id: string
  name: string
  cardsEnabled: boolean
  slots: GrandJeuSlot[]
  createdAt?: unknown
}

/** sessions/{id} — lisible par tout le monde, écrite uniquement par les admins */
export interface Session {
  id: string
  name: string
  status: 'waiting' | 'playing' | 'done'
  hasPassword: boolean
  createdAt: Timestamp | null
  mode: 'free' | 'grandjeu'
  phase: Phase
  /** compteur global : chaque question/tour a un seq unique ; les réponses sont rangées par seq */
  seq: number
  blockCount: number
  block?: Block | null
  round?: Round | null
  grandJeu?: (GrandJeu & { step: number }) | null
  /** Phase cartes : fin de la phase */
  cardsUntil?: Timestamp | null
  /** Roue libre : module tiré par la roue (affiché sur l'écran) */
  wheel?: { module: ModuleKey; at: number } | null
}

export interface Participant {
  id: string
  name: string
  score: number
  joinedAt?: unknown
  kicked?: boolean
  tokens?: number
  /** cartes déjà utilisées dans le Grand Jeu */
  usedCards?: CardKey[]
}

export interface Answer {
  id: string
  seq: number
  pid: string
  name: string
  at: Timestamp | null
  data: Record<string, any>
}

export type CardKey = 'tortue' | 'confiant' | 'duel' | 'bouclier'

export interface CardPlay {
  card: CardKey
  target?: string
}

/** sessions/{id}/rounds/{seq} — historique des points, sert au classement par module et au graphe */
export interface RoundLog {
  seq: number
  kind: 'question' | 'cards' | 'adjust'
  module?: ModuleKey
  blockNo?: number
  label: string
  results: Record<string, number>
  at?: unknown
}
