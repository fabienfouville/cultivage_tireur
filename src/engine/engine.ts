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
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { getModule, moduleConfig } from '../modules'
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
  Round,
  RoundLog,
  Session,
} from '../types'
import { CARDS, TORTUE_FACTOR, resolveCards } from './cards'

const sessionRef = (sid: string) => doc(db, 'sessions', sid)
const sub = (sid: string, name: string) => collection(db, 'sessions', sid, name)

async function getSession(sid: string): Promise<Session> {
  const snap = await getDoc(sessionRef(sid))
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

export interface BlockOptions {
  module: ModuleKey
  /** vide = thème au hasard */
  themeId: string
  count: number
  order: 'keep' | 'random'
  timer: number
  slot?: number
  tokensStart?: number
}

/** Choisit les questions d'un thème : dans l'ordre, ou au hasard en privilégiant les moins jouées */
export async function pickQuestions(themeId: string, module: ModuleKey, count: number, order: 'keep' | 'random') {
  const snap = await getDocs(query(collection(db, 'questions'), where('themeId', '==', themeId)))
  let qs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question & { played?: number; createdAt?: any })
  const mod = getModule(module)
  if (order === 'keep' || mod.ordered) {
    const created = (q: any) => q.createdAt?.toMillis?.() ?? (typeof q.createdAt === 'string' ? Date.parse(q.createdAt) : 0)
    qs.sort((a, b) => (Number(a.order ?? 1e9) - Number(b.order ?? 1e9)) || created(a) - created(b))
  } else {
    qs = qs
      .map((q) => ({ q, r: Math.random() + (q.played ?? 0) }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.q)
  }
  return qs.slice(0, Math.max(1, count))
}

/**
 * Thème au hasard pour un module : un thème qui a des questions, en évitant ceux déjà joués dans la session
 * (sauf s'il n'en reste plus).
 */
export async function randomTheme(module: ModuleKey, alreadyPlayed: string[] = []): Promise<string> {
  const snap = await getDocs(query(collection(db, 'themes'), where('module', '==', module)))
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
  // Pas de thème choisi → thème au hasard
  if (!opts.themeId) opts = { ...opts, themeId: await randomTheme(opts.module, current.playedThemes ?? []) }
  const [session, participants, stored, themeSnap] = await Promise.all([
    getSession(sid),
    getParticipants(sid),
    getStoredConfig(),
    getDoc(doc(db, 'themes', opts.themeId)),
  ])
  const questions = await pickQuestions(opts.themeId, opts.module, opts.count, opts.order)
  if (!questions.length) throw new Error('Ce thème ne contient aucune question')
  const mod = getModule(opts.module)
  const cfg = { ...moduleConfig(opts.module, stored), timer: opts.timer }
  let block: Block = {
    no: (session.blockCount ?? 0) + 1,
    module: opts.module,
    themeId: opts.themeId,
    themeName: themeSnap.get('name') ?? '',
    mapId: themeSnap.get('mapId') ?? undefined,
    questionIds: questions.map((q) => q.id),
    index: 0,
    timer: opts.timer,
    slot: opts.slot,
    tokensStart: opts.tokensStart,
  }
  const batch = writeBatch(db)
  const active = participants.filter((p) => !p.kicked)

  // Cartes du Grand Jeu jouées pendant la phase cartes qui précède ce bloc
  if (session.mode === 'grandjeu' && session.grandJeu?.cardsEnabled) {
    const plays = await getDocs(query(sub(sid, 'cardPlays'), where('blockNo', '==', session.blockCount ?? 0)))
    const cards: Record<string, CardPlay> = {}
    for (const d of plays.docs) {
      const { pid, card, target } = d.data() as { pid: string; card: CardKey; target?: string }
      const p = participants.find((x) => x.id === pid)
      if (!p || p.kicked || !CARDS[card] || p.usedCards?.includes(card)) continue
      if (CARDS[card].needsTarget && (!target || target === pid || !participants.some((x) => x.id === target))) continue
      cards[pid] = { card, target }
      batch.update(doc(db, 'sessions', sid, 'participants', pid), { usedCards: arrayUnion(card) })
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
    batch.update(doc(db, 'sessions', sid, 'participants', pid), upd)
  }
  batch.update(sessionRef(sid), {
    status: 'playing',
    phase: 'play',
    block,
    blockCount: block.no,
    playedThemes: arrayUnion(opts.themeId),
    round: null,
    wheel: null,
    cardsUntil: null,
  })
  await batch.commit()
  await startRound(sid, 0)
}

/* ───────────────────────────── Questions ───────────────────────────── */

export async function startRound(sid: string, index: number, opts: { tour?: number; state?: Record<string, any> } = {}) {
  const session = await getSession(sid)
  const block = session.block
  if (!block) throw new Error('Aucun bloc en cours')
  const qid = block.questionIds[index]
  const [q, stored] = await Promise.all([getQuestion(qid), getStoredConfig()])
  const mod = getModule(block.module)
  const cfg = { ...moduleConfig(block.module, stored), timer: block.timer }
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
    public: mod.publicPayload(q, { block, cfg, state: opts.state }),
    tour: opts.tour ?? 1,
    state: opts.state ?? {},
    answered: [],
    verdicts: {},
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
      await runTransaction(db, async (tx) => {
        const cur = (await tx.get(sessionRef(sid))).data() as Session
        if (cur.round?.seq !== seq || cur.round.status !== 'answering') return
        tx.update(sessionRef(sid), { 'round.status': 'validating', 'round.verdicts': verdicts })
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
  const [answers, participants, q, stored] = await Promise.all([
    getAnswers(sid, seq),
    getParticipants(sid),
    getQuestion(round.qid),
    getStoredConfig(),
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
  const q = await getQuestion(round.qid)
  await updateDoc(sessionRef(sid), {
    'round.solution': getModule(round.module).solution(q),
    'round.state.ended': true,
  })
}

/** Question suivante, ou fin du bloc */
export async function next(sid: string) {
  const session = await getSession(sid)
  const block = session.block
  if (!block) return
  const mod = getModule(block.module)
  const idx = session.round ? session.round.index + 1 : block.index
  if (idx >= block.questionIds.length || mod.blockOver?.(block)) return endBlock(sid)
  await startRound(sid, idx)
}

/** Passer la question sans compter de points */
export async function skip(sid: string) {
  return next(sid)
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
  const batch = writeBatch(db)
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
      batch.update(doc(db, 'sessions', sid, 'participants', pid), { score: increment(b.pts) })
    }
    batch.set(doc(db, 'sessions', sid, 'rounds', `cards_${block.no}`), {
      seq: session.seq + 0.5,
      kind: 'cards',
      blockNo: block.no,
      label: '🃏 Cartes',
      results,
      details: Object.fromEntries(Object.entries(bonus).map(([pid, b]) => [pid, b.detail])),
      at: serverTimestamp(),
    })
  }
  batch.update(sessionRef(sid), { phase: 'blockResults' })
  await batch.commit()
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
  if (session.grandJeu.cardsEnabled) {
    await updateDoc(sessionRef(sid), {
      phase: 'cards',
      round: null,
      block: null,
      'grandJeu.step': step,
      cardsUntil: Timestamp.fromMillis(Date.now() + 40_000),
    })
    return
  }
  await updateDoc(sessionRef(sid), { 'grandJeu.step': step })
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
    phase: 'play',
    grandJeu: { id, name, slots, cardsEnabled, step: 0 },
    round: null,
    block: null,
  })
  await batch.commit()
  await startSlot(sid, slots[0], 0)
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
    tx.update(sessionRef(sid), { 'round.answered': arrayUnion(...pids) })
  })
}
