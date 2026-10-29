/**
 * Le moteur de jeu. Toutes ces actions sont lancées par un admin (régie sur téléphone ou écran projeté
 * connecté en admin) et écrivent dans Firestore ; joueurs et écran ne font qu'afficher la session.
 *
 * Plusieurs appareils admin peuvent être ouverts en même temps : chaque transition vérifie dans une
 * transaction que la session est toujours dans l'état attendu, donc rien n'est compté deux fois, et
 * fermer un onglet ne bloque jamais la partie (n'importe quel autre appareil admin reprend la main).
 */
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  FieldPath,
  getDoc,
  getCountFromServer,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Transaction,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { serverNow } from '../lib/clock'
import { ensurePlayableAudio } from '../lib/media'
import { bankOf, getModule, moduleConfig } from '../modules'
import type {
  Answer,
  Block,
  CardKey,
  CardPlay,
  GrandJeu,
  GrandJeuSlot,
  ModuleKey,
  Participant,
  Question,
  ReviewItem,
  Round,
  RoundLog,
  Session,
} from '../types'
import { CARDS, CARDS_ON, TORTUE_FACTOR, resolveCards } from './cards'

const sessionRef = (sid: string) => doc(db, 'sessions', sid)
const sub = (sid: string, name: string) => collection(db, 'sessions', sid, name)

// Le moteur lit la session dans une transaction, c'est-à-dire toujours sur le serveur. Un simple getDoc (même
// getDocFromServer) renvoie l'état connu de l'écoute en temps réel déjà ouverte sur la session ; or une transaction
// qui vient de réussir n'y arrive que quelques centaines de millisecondes plus tard sur le vrai Firestore
// (bug « Aucun bloc en cours » au lancement de chaque jeu, invisible avec l'émulateur local qui est instantané).
async function getSession(sid: string): Promise<Session> {
  const snap = await runTransaction(db, (tx) => tx.get(sessionRef(sid)))
  if (!snap.exists()) throw new Error('Session introuvable')
  return { id: snap.id, ...snap.data() } as Session
}

async function getParticipants(sid: string): Promise<Participant[]> {
  const snap = await getDocs(sub(sid, 'participants'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Participant)
}

export async function getAnswers(sid: string, seq: number): Promise<Answer[]> {
  const snap = await getDocs(query(sub(sid, 'answers'), where('seq', '==', seq)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Answer)
}

async function getQuestion(qid: string): Promise<Question> {
  const snap = await getDoc(doc(db, 'questions', qid))
  if (!snap.exists()) throw new Error('Question introuvable : ' + qid)
  return { id: snap.id, ...snap.data() } as Question
}

let configCache: { at: number; value: Record<string, any> } | null = null
export async function getStoredConfig(): Promise<Record<string, any>> {
  if (configCache && Date.now() - configCache.at < 10_000) return configCache.value
  const snap = await getDoc(doc(db, 'config', 'modules'))
  configCache = { at: Date.now(), value: snap.exists() ? snap.data() : {} }
  return configCache.value
}
export function clearConfigCache() {
  configCache = null
  generalCache = null
}

/** Réglages généraux (config/general) */
export interface GeneralConfig {
  /** secondes avant de passer automatiquement à la question suivante après la révélation (0 = jamais) */
  autoNext: number
  /** arrêter la question dès que tout le monde a répondu */
  autoClose: boolean
}
export const GENERAL_DEFAULTS: GeneralConfig = { autoNext: 10, autoClose: true }
let generalCache: { at: number; value: GeneralConfig } | null = null
export async function getGeneralConfig(): Promise<GeneralConfig> {
  if (generalCache && Date.now() - generalCache.at < 10_000) return generalCache.value
  const snap = await getDoc(doc(db, 'config', 'general'))
  generalCache = { at: Date.now(), value: { ...GENERAL_DEFAULTS, ...(snap.exists() ? snap.data() : {}) } }
  return generalCache.value
}

/* ───────────────────────────── Sessions ───────────────────────────── */

export async function createSession(name: string, password?: string): Promise<string> {
  const ref = await addDoc(collection(db, 'sessions'), {
    name: name.trim() || 'Soirée Cultivage',
    status: 'waiting',
    hasPassword: !!password,
    createdAt: serverTimestamp(),
    mode: 'free',
    phase: 'lobby',
    seq: 0,
    blockCount: 0,
    block: null,
    round: null,
    grandJeu: null,
  })
  if (password) await setDoc(doc(db, 'sessionSecrets', ref.id), { password })
  return ref.id
}

export async function setSessionPassword(sid: string, password: string) {
  if (password) await setDoc(doc(db, 'sessionSecrets', sid), { password })
  else await deleteDoc(doc(db, 'sessionSecrets', sid))
  await updateDoc(sessionRef(sid), { hasPassword: !!password })
}

export async function endSession(sid: string) {
  await updateDoc(sessionRef(sid), { status: 'done', phase: 'final', round: null })
}

export async function reopenSession(sid: string) {
  await updateDoc(sessionRef(sid), { status: 'playing', phase: 'pick', round: null, block: null })
}

export async function deleteSession(sid: string) {
  for (const name of ['answers', 'participants', 'rounds', 'cardPlays', 'keys']) {
    const snap = await getDocs(sub(sid, name))
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db)
      snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref))
      await b.commit()
    }
  }
  await deleteDoc(doc(db, 'sessionSecrets', sid)).catch(() => {})
  await deleteDoc(sessionRef(sid))
}

/** Roue libre : l'animateur choisit les jeux au fil de la soirée */
export async function startFreeMode(sid: string) {
  await updateDoc(sessionRef(sid), { status: 'playing', mode: 'free', phase: 'pick', round: null, block: null, grandJeu: null })
}

export async function spinWheel(sid: string, modules: ModuleKey[]): Promise<ModuleKey> {
  const module = modules[Math.floor(Math.random() * modules.length)]
  await updateDoc(sessionRef(sid), { wheel: { module, at: Date.now() } })
  return module
}

/* ───────────────────────────── Blocs ───────────────────────────── */

/** Valeurs spéciales du thème d'un bloc : toutes les questions du jeu (par défaut) ou un thème tiré au sort */
export const ALL_THEMES = ''
export const RANDOM_THEME = '?'

export interface BlockOptions {
  module: ModuleKey
  /** ALL_THEMES (vide) = toutes les questions du jeu, RANDOM_THEME = un thème au hasard, sinon l'id du thème */
  themeId: string
  count: number
  order: 'keep' | 'random'
  timer: number
  slot?: number
  tokensStart?: number
}

/**
 * Choisit les questions d'un thème (ou de tous les thèmes du jeu) : dans l'ordre, ou au hasard en privilégiant
 * les moins jouées
 */
export async function pickQuestions(themeId: string, module: ModuleKey, count: number, order: 'keep' | 'random') {
  const all = themeId === ALL_THEMES
  let qs = all
    ? await sampleQuestions(module)
    : (await getDocs(query(collection(db, 'questions'), where('themeId', '==', themeId)))).docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Question & { played?: number; createdAt?: any },
      )
  const mod = getModule(module)
  // Copie mélangée : à difficulté égale (100% Logique), on ne reprend pas toujours les mêmes questions
  if (all) qs = qs.map((q) => ({ q, r: Math.random() + (q.played ?? 0) })).sort((a, b) => a.r - b.r).map((x) => x.q)
  // Toutes les questions : mélangées, sauf pour les jeux à difficulté croissante (100% Logique)
  if (mod.orderBy || (!all && (order === 'keep' || mod.ordered))) {
    const created = (q: any) => q.createdAt?.toMillis?.() ?? (typeof q.createdAt === 'string' ? Date.parse(q.createdAt) : 0)
    const rank = mod.orderBy ?? ((q: Question) => Number(q.order ?? 1e9))
    qs.sort((a, b) => rank(a) - rank(b) || created(a) - created(b))
    // Jeu à difficulté croissante (100% Logique) : on garde des questions de toute la gamme, de la plus facile à la plus dure
    if (mod.orderBy && count > 0 && count < qs.length) {
      const step = (qs.length - 1) / Math.max(1, count - 1)
      qs = Array.from({ length: count }, (_, i) => qs[Math.round(i * step)])
    }
  } else {
    qs = qs
      .map((q) => ({ q, r: Math.random() + (q.played ?? 0) }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.q)
  }
  const picked = qs.slice(0, Math.max(1, count))
  // Banque gardée en mémoire : on note tout de suite ces questions comme jouées pour les prochains tirages
  if (all) picked.forEach((q) => (q.played = (q.played ?? 0) + 1))
  return picked
}

type Banked = Question & { played?: number; createdAt?: any }
/**
 * Toutes les questions d'un jeu, pour un tirage vraiment au hasard dans toute la banque.
 * Chaque question lue compte dans le quota gratuit de Firestore (50 000 lectures par jour) et le QCM en a près
 * d'un millier : la banque est lue une fois par appareil, puis gardée en mémoire 30 minutes.
 */
const bankCache = new Map<string, { at: number; questions: Banked[] }>()
async function sampleQuestions(module: ModuleKey): Promise<Banked[]> {
  const key = bankOf(module)
  const cached = bankCache.get(key)
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.questions
  const snap = await getDocs(query(collection(db, 'questions'), where('module', '==', key)))
  const questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Banked)
  bankCache.set(key, { at: Date.now(), questions })
  return questions
}

/**
 * Thème au hasard pour un module : un thème qui a des questions, en évitant ceux déjà joués dans la session
 * (sauf s'il n'en reste plus).
 */
export async function randomTheme(module: ModuleKey, alreadyPlayed: string[] = []): Promise<string> {
  // Les variantes (Gambling, Duo/Carré) piochent dans les thèmes du jeu principal
  const snap = await getDocs(query(collection(db, 'themes'), where('module', '==', bankOf(module))))
  const ids = snap.docs.map((d) => d.id).sort(() => Math.random() - 0.5)
  const fresh = ids.filter((id) => !alreadyPlayed.includes(id))
  for (const id of [...fresh, ...ids.filter((x) => !fresh.includes(x))]) {
    const count = await getCountFromServer(query(collection(db, 'questions'), where('themeId', '==', id)))
    if (count.data().count > 0) return id
  }
  throw new Error('Aucun thème avec des questions pour ce jeu')
}

export async function startBlock(sid: string, opts: BlockOptions) {
  const current = await getSession(sid)
  if (opts.themeId === RANDOM_THEME) opts = { ...opts, themeId: await randomTheme(opts.module, current.playedThemes ?? []) }
  const all = opts.themeId === ALL_THEMES
  const [session, participants, stored, themeSnap] = await Promise.all([
    getSession(sid),
    getParticipants(sid),
    getStoredConfig(),
    all ? null : getDoc(doc(db, 'themes', opts.themeId)),
  ])
  const questions = await pickQuestions(opts.themeId, opts.module, opts.count, opts.order)
  if (!questions.length) throw new Error(all ? 'Aucune question pour ce jeu' : 'Ce thème ne contient aucune question')
  // Toutes les questions en Géoloc : chaque question garde la carte de son thème
  let mapIds: Record<string, string> | undefined
  if (all && getModule(opts.module).themeHasMap) {
    const themes = await getDocs(query(collection(db, 'themes'), where('module', '==', bankOf(opts.module))))
    const byTheme = Object.fromEntries(themes.docs.map((d) => [d.id, d.get('mapId') ?? 'world']))
    mapIds = Object.fromEntries(questions.map((q) => [q.id, byTheme[q.themeId] ?? 'world']))
  }
  const mod = getModule(opts.module)
  const cfg = { ...moduleConfig(opts.module, stored), timer: opts.timer }
  let block: Block = {
    no: (session.blockCount ?? 0) + 1,
    module: opts.module,
    themeId: opts.themeId,
    themeName: all ? 'Toutes les questions' : themeSnap?.get('name') ?? '',
    ...(themeSnap?.get('mapId') ? { mapId: themeSnap.get('mapId') } : {}),
    ...(mapIds ? { mapIds } : {}),
    questionIds: questions.map((q) => q.id),
    index: 0,
    timer: opts.timer,
    slot: opts.slot,
    tokensStart: opts.tokensStart,
  }
  // Écritures faites d'un bloc, seulement si personne n'a lancé un autre jeu entre-temps (double clic, 2 admins)
  const ops: Array<(tx: Transaction) => void> = []
  const active = participants.filter((p) => !p.kicked)

  // Cartes du Grand Jeu jouées pendant la phase cartes qui précède ce bloc
  if (CARDS_ON && session.mode === 'grandjeu' && session.grandJeu?.cardsEnabled) {
    const plays = await getDocs(query(sub(sid, 'cardPlays'), where('blockNo', '==', session.blockCount ?? 0)))
    const cards: Record<string, CardPlay> = {}
    for (const d of plays.docs) {
      const { pid, card, target } = d.data() as { pid: string; card: CardKey; target?: string }
      const p = participants.find((x) => x.id === pid)
      if (!p || p.kicked || !CARDS[card] || p.usedCards?.includes(card)) continue
      if (CARDS[card].needsTarget && (!target || target === pid || !participants.some((x) => x.id === target))) continue
      cards[pid] = { card, target }
      ops.push((tx) => tx.update(doc(db, 'sessions', sid, 'participants', pid), { usedCards: arrayUnion(card) }))
    }
    const shielded = new Set(Object.entries(cards).filter(([, c]) => c.card === 'bouclier').map(([pid]) => pid))
    const slowed = [...new Set(Object.values(cards).filter((c) => c.card === 'tortue').map((c) => c.target!))].filter(
      (pid) => !shielded.has(pid),
    )
    block = { ...block, cards, slowed }
  }

  const init = mod.initBlock?.(block, active, cfg)
  if (init?.block) block = { ...block, ...init.block }
  for (const [pid, upd] of Object.entries(init?.participants ?? {})) {
    ops.push((tx) => tx.update(doc(db, 'sessions', sid, 'participants', pid), upd))
  }
  ops.push((tx) =>
    tx.update(sessionRef(sid), {
    status: 'playing',
    phase: 'play',
    block,
    blockCount: block.no,
    ...(all ? {} : { playedThemes: arrayUnion(opts.themeId) }),
    round: null,
    wheel: null,
    cardsUntil: null,
    introAt: null,
    }),
  )
  await runTransaction(db, async (tx) => {
    const cur = (await tx.get(sessionRef(sid))).data() as Session
    if ((cur.blockCount ?? 0) !== (session.blockCount ?? 0) || (cur.seq ?? 0) !== (session.seq ?? 0))
      throw new Error('Un jeu vient déjà d’être lancé')
    ops.forEach((op) => op(tx))
  })
  await startRound(sid, 0)
}

/* ───────────────────────────── Questions ───────────────────────────── */

export async function startRound(sid: string, index: number, opts: { tour?: number; state?: Record<string, any> } = {}) {
  const session = await getSession(sid)
  const block = session.block
  if (!block) throw new Error('Aucun bloc en cours')
  const qid = block.questionIds[index]
  const mod = getModule(block.module)
  const prevId = mod.usesPrevious && index > 0 ? block.questionIds[index - 1] : null
  const [q, stored, prev] = await Promise.all([getQuestion(qid), getStoredConfig(), prevId ? getQuestion(prevId).catch(() => undefined) : undefined])
  const cfg = { ...moduleConfig(block.module, stored), timer: block.timer }
  // Blind test : extrait absent (pack) ou vieux lien expiré (Deezer) → on le retrouve sur iTunes et on corrige la question
  if (block.module === 'blindtest' && (q.audioUrl || q.answerHintAuthor || q.answerHintTitle)) {
    const url = await ensurePlayableAudio(q)
    if (url && url !== q.audioUrl) {
      q.audioUrl = url
      await updateDoc(doc(db, 'questions', q.id), { audioUrl: url }).catch(console.warn)
    }
  }
  const seq = (session.seq ?? 0) + 1
  const round: Round = {
    seq,
    module: block.module,
    qid,
    index,
    total: block.questionIds.length,
    status: 'answering',
    startedAt: null,
    duration: block.timer,
    public: mod.publicPayload(q, { block, cfg, state: opts.state, prev }),
    tour: opts.tour ?? 1,
    state: opts.state ?? {},
    answered: [],
    verdicts: {},
    review: [],
    autoNextAt: null,
  }
  await runTransaction(db, async (tx) => {
    const cur = (await tx.get(sessionRef(sid))).data() as Session
    if ((cur.seq ?? 0) !== session.seq) throw new Error('La session a changé entre-temps, réessaie')
    tx.update(sessionRef(sid), {
      seq,
      phase: 'play',
      round: { ...round, startedAt: serverTimestamp() },
      'block.index': index,
    })
  })
}

/** Les réponses qui comptent : joueurs autorisés, et pas hors délai pour les joueurs ralentis (Tortue) */
function eligibleAnswers(answers: Answer[], session: Session, participants: Participant[]): Answer[] {
  const block = session.block!
  const round = session.round!
  const mod = getModule(block.module)
  const ok = new Set(participants.filter((p) => !p.kicked).map((p) => p.id))
  const start = round.startedAt?.toMillis?.() ?? 0
  return answers.filter((a) => {
    if (!ok.has(a.pid)) return false
    if (mod.canAnswer && !mod.canAnswer(block, a.pid)) return false
    if (block.slowed?.includes(a.pid) && start) {
      const limit = start + round.duration * TORTUE_FACTOR * 1000 + 1000
      if ((a.at?.toMillis?.() ?? 0) > limit) return false
    }
    return true
  })
}

/** Fin du temps (ou clic « Stop ») : on passe en validation ou on révèle directement */
export async function closeRound(sid: string, seq: number) {
  const session = await getSession(sid)
  const round = session.round
  if (!round || round.seq !== seq || round.status !== 'answering') return
  const mod = getModule(round.module)
  if (mod.manual && mod.validationItems) {
    const [answers, participants, q, stored] = await Promise.all([
      getAnswers(sid, seq),
      getParticipants(sid),
      getQuestion(round.qid),
      getStoredConfig(),
    ])
    const eligible = eligibleAnswers(answers, session, participants)
    const items = mod.validationItems({
      q,
      answers: eligible,
      round,
      block: session.block!,
      cfg: moduleConfig(round.module, stored),
      participants,
    })
    if (items.length) {
      const verdicts = Object.fromEntries(items.filter((i) => i.suggested).map((i) => [i.key, true]))
      const names = new Map(participants.map((p) => [p.id, p.name]))
      // Publié pour la correction collective (le temps est écoulé, on peut tout montrer)
      const review: ReviewItem[] = items
        .filter((i) => i.count > 0)
        .map((i) => ({ key: i.key, label: i.label, group: i.group, names: (i.pids ?? []).map((pid) => names.get(pid) ?? '?') }))
      await runTransaction(db, async (tx) => {
        const cur = (await tx.get(sessionRef(sid))).data() as Session
        if (cur.round?.seq !== seq || cur.round.status !== 'answering') return
        tx.update(sessionRef(sid), { 'round.status': 'validating', 'round.verdicts': verdicts, 'round.review': review })
      })
      return
    }
  }
  await reveal(sid, seq)
}

export async function setVerdict(sid: string, key: string, value: boolean) {
  await updateDoc(sessionRef(sid), new FieldPath('round', 'verdicts', key), value)
}

/** Calcule les points de la question et les révèle (une seule fois, même si plusieurs admins cliquent) */
export async function reveal(sid: string, seq: number) {
  const session = await getSession(sid)
  const round = session.round
  const block = session.block
  if (!round || !block || round.seq !== seq || round.status === 'revealed') return
  const mod = getModule(round.module)
  const [answers, participants, q, stored, general] = await Promise.all([
    getAnswers(sid, seq),
    getParticipants(sid),
    getQuestion(round.qid),
    getStoredConfig(),
    getGeneralConfig(),
  ])
  const cfg = { ...moduleConfig(round.module, stored), timer: block.timer }
  const res = await mod.score({
    q,
    answers: eligibleAnswers(answers, session, participants),
    round,
    block,
    cfg,
    participants: participants.filter((p) => !p.kicked),
    verdicts: round.verdicts ?? {},
  })
  // Le Top : la solution complète n'est donnée qu'à la fin de la question
  const solution = mod.multiTour ? null : mod.solution(q)
  const log: RoundLog = {
    seq,
    kind: 'question',
    module: round.module,
    blockNo: block.no,
    label: `${mod.icon} ${String(q.text ?? '').slice(0, 60)}`,
    results: Object.fromEntries(Object.entries(res.results).map(([pid, r]) => [pid, r.pts])),
  }

  await runTransaction(db, async (tx) => {
    const ref = sessionRef(sid)
    const cur = (await tx.get(ref)).data() as Session
    if (cur.round?.seq !== seq || cur.round.status === 'revealed') return
    const update: Record<string, any> = {
      'round.status': 'revealed',
      'round.results': res.results,
      'round.summary': res.summary ?? {},
      // Le Top se joue en plusieurs tours : l'animateur décide de la suite
      'round.autoNextAt':
        !mod.multiTour && !cur.autoNextOff && general.autoNext > 0 ? Timestamp.fromMillis(serverNow() + general.autoNext * 1000) : null,
    }
    if (solution) update['round.solution'] = solution
    if (res.state) update['round.state'] = { ...(cur.round.state ?? {}), ...res.state }
    if (res.block) for (const [k, v] of Object.entries(res.block)) update[`block.${k}`] = v
    tx.update(ref, update)
    for (const [pid, r] of Object.entries(res.results)) {
      const extra = res.participants?.[pid] ?? {}
      if (r.pts || Object.keys(extra).length) {
        tx.update(doc(db, 'sessions', sid, 'participants', pid), { ...extra, score: increment(r.pts) })
      }
    }
    for (const [pid, extra] of Object.entries(res.participants ?? {})) {
      if (!res.results[pid]) tx.update(doc(db, 'sessions', sid, 'participants', pid), extra)
    }
    tx.set(doc(db, 'sessions', sid, 'rounds', String(seq)), { ...log, at: serverTimestamp() })
    if (round.tour === 1 || !round.tour) tx.update(doc(db, 'questions', round.qid), { played: increment(1) })
  })
}

/** Le Top : nouveau tour sur la même question */
export async function nextTour(sid: string) {
  const session = await getSession(sid)
  const round = session.round
  if (!round || round.status !== 'revealed') return
  await startRound(sid, round.index, { tour: (round.tour ?? 1) + 1, state: round.state })
}

/** Le Top : on dévoile tout le classement */
export async function revealAll(sid: string) {
  const session = await getSession(sid)
  const round = session.round
  if (!round) return
  const [q, general] = await Promise.all([getQuestion(round.qid), getGeneralConfig()])
  await updateDoc(sessionRef(sid), {
    'round.solution': getModule(round.module).solution(q),
    'round.state.ended': true,
    'round.autoNextAt': !session.autoNextOff && general.autoNext > 0 ? Timestamp.fromMillis(serverNow() + general.autoNext * 1000) : null,
  })
}

/** Question suivante, ou fin du bloc. `expectedSeq` : ne rien faire si la question a déjà changé (passage auto) */
export async function next(sid: string, expectedSeq?: number) {
  const session = await getSession(sid)
  const block = session.block
  if (!block || session.phase !== 'play') return
  if (expectedSeq != null && session.round?.seq !== expectedSeq) return
  const mod = getModule(block.module)
  // Le Top : on montre d'abord le classement complet à tout le monde
  if (mod.multiTour && session.round?.status === 'revealed' && !session.round.state?.ended) return revealAll(sid)
  const idx = session.round ? session.round.index + 1 : block.index
  if (idx >= block.questionIds.length || mod.blockOver?.(block)) return endBlock(sid)
  await startRound(sid, idx)
}

/** Passer la question sans compter de points */
export async function skip(sid: string) {
  return next(sid)
}

/** Met en pause le passage automatique à la question suivante */
export async function pauseAutoNext(sid: string) {
  await updateDoc(sessionRef(sid), { 'round.autoNextAt': null })
}

/**
 * Coupe (ou remet) le passage automatique pour toute la session, le temps de débattre d'une question.
 * Remis en route sur une question déjà révélée : le compte à rebours repart de zéro.
 */
export async function setAutoNext(sid: string, on: boolean) {
  const general = await getGeneralConfig()
  await runTransaction(db, async (tx) => {
    const ref = sessionRef(sid)
    const cur = (await tx.get(ref)).data() as Session
    const update: Record<string, any> = { autoNextOff: !on }
    const round = cur.round
    if (round?.status === 'revealed') {
      const waitsHost = getModule(round.module).multiTour && !round.state?.ended
      update['round.autoNextAt'] =
        on && !waitsHost && general.autoNext > 0 ? Timestamp.fromMillis(serverNow() + general.autoNext * 1000) : null
    }
    tx.update(ref, update)
  })
}

export async function addTime(sid: string, seconds: number) {
  const session = await getSession(sid)
  if (session.round?.status !== 'answering') return
  await updateDoc(sessionRef(sid), { 'round.duration': session.round.duration + seconds })
}

/** Points de chaque joueur sur un bloc (somme de l'historique) */
export async function blockTotals(sid: string, blockNo: number): Promise<Record<string, number>> {
  const snap = await getDocs(query(sub(sid, 'rounds'), where('blockNo', '==', blockNo)))
  const totals: Record<string, number> = {}
  for (const d of snap.docs) {
    const log = d.data() as RoundLog
    if (log.kind !== 'question') continue
    for (const [pid, pts] of Object.entries(log.results ?? {})) totals[pid] = (totals[pid] ?? 0) + pts
  }
  return totals
}

export async function endBlock(sid: string) {
  const session = await getSession(sid)
  const block = session.block
  if (!block || session.phase === 'blockResults') return
  // Transaction : le passage auto peut être déclenché par plusieurs appareils admin à la fois,
  // il ne faut compter les bonus des cartes qu'une fois
  const ops: Array<(tx: Transaction) => void> = []
  if (block.cards && Object.keys(block.cards).length) {
    const [totals, participants] = await Promise.all([blockTotals(sid, block.no), getParticipants(sid)])
    const bonus = resolveCards(
      block.cards,
      totals,
      participants.filter((p) => !p.kicked).map((p) => p.id),
    )
    const results: Record<string, number> = {}
    for (const [pid, b] of Object.entries(bonus)) {
      if (!b.pts) continue
      results[pid] = b.pts
      ops.push((tx) => tx.update(doc(db, 'sessions', sid, 'participants', pid), { score: increment(b.pts) }))
    }
    const log = {
      seq: session.seq + 0.5,
      kind: 'cards',
      blockNo: block.no,
      label: '🃏 Cartes',
      results,
      details: Object.fromEntries(Object.entries(bonus).map(([pid, b]) => [pid, b.detail])),
      at: serverTimestamp(),
    }
    ops.push((tx) => tx.set(doc(db, 'sessions', sid, 'rounds', `cards_${block.no}`), log))
  }
  await runTransaction(db, async (tx) => {
    const cur = (await tx.get(sessionRef(sid))).data() as Session
    if (cur.phase !== 'play' || cur.block?.no !== block.no) return
    ops.forEach((op) => op(tx))
    tx.update(sessionRef(sid), { phase: 'blockResults' })
  })
}

/** Après les résultats d'un bloc : retour au choix (roue libre) ou slot suivant (Grand Jeu) */
export async function afterBlock(sid: string) {
  const session = await getSession(sid)
  if (session.mode !== 'grandjeu' || !session.grandJeu) {
    await updateDoc(sessionRef(sid), { phase: 'pick', round: null, block: null })
    return
  }
  const step = session.grandJeu.step + 1
  if (step >= session.grandJeu.slots.length) {
    await updateDoc(sessionRef(sid), { phase: 'final', round: null, block: null, 'grandJeu.step': step })
    return
  }
  if (CARDS_ON && session.grandJeu.cardsEnabled) {
    await updateDoc(sessionRef(sid), {
      phase: 'cards',
      round: null,
      block: null,
      'grandJeu.step': step,
      cardsUntil: Timestamp.fromMillis(Date.now() + 40_000),
    })
    return
  }
  // Annonce du jeu suivant ; un seul appareil admin fait passer à l'étape suivante
  await runTransaction(db, async (tx) => {
    const cur = (await tx.get(sessionRef(sid))).data() as Session
    if (cur.phase !== 'blockResults' || cur.grandJeu?.step !== step - 1) return
    tx.update(sessionRef(sid), { phase: 'intro', round: null, block: null, 'grandJeu.step': step, introAt: Date.now() })
  })
}

/** Grand Jeu : fin de l'annonce, on lance le jeu annoncé (une seule fois, même avec plusieurs admins) */
export async function startAnnouncedGame(sid: string) {
  const session = await getSession(sid)
  if (session.phase !== 'intro' || !session.grandJeu) return
  const step = session.grandJeu.step
  await startSlot(sid, session.grandJeu.slots[step], step)
}

export async function startSlot(sid: string, slot: GrandJeuSlot, step: number) {
  await startBlock(sid, {
    module: slot.module,
    themeId: slot.themeId,
    count: slot.questionCount,
    order: 'keep',
    timer: slot.timer,
    slot: step,
  })
}

/** Fin de la phase cartes → on lance le module du slot courant */
export async function endCardsPhase(sid: string) {
  const session = await getSession(sid)
  if (session.phase !== 'cards' || !session.grandJeu) return
  const step = session.grandJeu.step
  // On bascule d'abord la phase pour qu'un 2ᵉ appareil admin ne relance pas le même slot
  const ok = await runTransaction(db, async (tx) => {
    const cur = (await tx.get(sessionRef(sid))).data() as Session
    if (cur.phase !== 'cards') return false
    tx.update(sessionRef(sid), { phase: 'play', cardsUntil: null })
    return true
  })
  if (ok) await startSlot(sid, session.grandJeu.slots[step], step)
}

/** Lance un Grand Jeu dans la session : scores remis à zéro */
export async function startGrandJeu(sid: string, gj: GrandJeu) {
  const participants = await getParticipants(sid)
  const batch = writeBatch(db)
  for (const p of participants) {
    batch.update(doc(db, 'sessions', sid, 'participants', p.id), { score: 0, usedCards: [], tokens: 0 })
  }
  const rounds = await getDocs(sub(sid, 'rounds'))
  rounds.docs.forEach((d) => batch.delete(d.ref))
  const { id, name, slots, cardsEnabled } = gj
  batch.update(sessionRef(sid), {
    status: 'playing',
    mode: 'grandjeu',
    grandJeu: { id, name, slots, cardsEnabled: CARDS_ON && !!cardsEnabled, step: 0 },
    round: null,
    block: null,
    // Le premier jeu est annoncé (roue + règles) avant de commencer
    phase: 'intro',
    introAt: Date.now(),
  })
  await batch.commit()
}

/* ───────────────────────────── Joueurs ───────────────────────────── */

export async function adjustScore(sid: string, pid: string, delta: number) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'sessions', sid, 'participants', pid), { score: increment(delta) })
  batch.set(doc(sub(sid, 'rounds')), {
    seq: Date.now(),
    kind: 'adjust',
    label: '✏️ Ajustement',
    results: { [pid]: delta },
    at: serverTimestamp(),
  })
  await batch.commit()
}

export async function kick(sid: string, pid: string, kicked = true) {
  await updateDoc(doc(db, 'sessions', sid, 'participants', pid), { kicked })
}

export async function removePlayer(sid: string, pid: string) {
  await deleteDoc(doc(db, 'sessions', sid, 'participants', pid))
}

export async function resetScores(sid: string) {
  const participants = await getParticipants(sid)
  const batch = writeBatch(db)
  for (const p of participants) batch.update(doc(db, 'sessions', sid, 'participants', p.id), { score: 0 })
  const rounds = await getDocs(sub(sid, 'rounds'))
  rounds.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
}

/** Tenu à jour par les appareils admin : qui a déjà répondu (affiché sur l'écran) */
export async function markAnswered(sid: string, seq: number, pids: string[]) {
  if (!pids.length) return
  await runTransaction(db, async (tx) => {
    const cur = (await tx.get(sessionRef(sid))).data() as Session
    if (cur.round?.seq !== seq) return
    // Déjà noté par un autre appareil admin : pas d'écriture inutile
    if (pids.every((pid) => cur.round!.answered?.includes(pid))) return
    tx.update(sessionRef(sid), { 'round.answered': arrayUnion(...pids) })
  })
}

/**
 * Migration (une seule fois) : les thèmes Gambling et Duo/Carré deviennent des thèmes du QCM,
 * jouables dans les 3 variantes. Les questions Duo/Carré passent au format QCM (answers/correct).
 * Renvoie le nombre de thèmes déplacés.
 */
export async function mergeVariantThemes(): Promise<number> {
  const [variantThemes, qcmThemes] = await Promise.all([
    getDocs(query(collection(db, 'themes'), where('module', 'in', ['gambling', 'duo-carre-cash']))),
    getDocs(query(collection(db, 'themes'), where('module', '==', 'qcm'))),
  ])
  const taken = new Set(qcmThemes.docs.map((d) => String(d.get('name')).toLowerCase()))
  let moved = 0
  for (const t of variantThemes.docs) {
    const from = t.get('module') as string
    let name = String(t.get('name') ?? 'Sans nom')
    // Évite deux thèmes du même nom (ex. « Wimereux » existait en QCM et en Gambling)
    if (taken.has(name.toLowerCase())) name = `${name} (${from === 'gambling' ? 'Gambling' : 'Duo/Carré'})`
    taken.add(name.toLowerCase())
    const qs = await getDocs(query(collection(db, 'questions'), where('themeId', '==', t.id)))
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [(b) => b.update(t.ref, { module: 'qcm', name, mergedFrom: from })]
    for (const q of qs.docs) {
      const d = q.data()
      const patch: Record<string, unknown> = { module: 'qcm' }
      if (d.answers == null && Array.isArray(d.choices)) patch.answers = d.choices
      if (d.correct == null && d.correctIndex != null) patch.correct = d.correctIndex
      ops.push((b) => b.update(q.ref, patch))
    }
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db)
      ops.slice(i, i + 400).forEach((op) => op(b))
      await b.commit()
    }
    moved++
  }
  return moved
}
