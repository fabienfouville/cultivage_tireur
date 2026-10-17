/**
 * Tests des règles de sécurité Firestore (firestore.rules).
 * Lancer : npm run test:rules (démarre l'émulateur Firestore tout seul).
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const ADMIN = { email: 'liloufe@gmail.com', email_verified: true }
const admin = () => env.authenticatedContext('admin', ADMIN).firestore()
const player = (uid = 'p1') => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } } as any).firestore()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cultivage-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env?.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'questions/q1'), { module: 'qcm', text: '?', answers: ['a', 'b', 'c', 'd'], correct: 2 })
    await setDoc(doc(db, 'sessions/open'), {
      status: 'playing',
      hasPassword: false,
      round: { seq: 5, status: 'answering', startedAt: Timestamp.now(), duration: 30 },
    })
    await setDoc(doc(db, 'sessions/locked'), { status: 'waiting', hasPassword: true, round: null })
    await setDoc(doc(db, 'sessionSecrets/locked'), { password: 'chut' })
    await setDoc(doc(db, 'sessions/open/participants/p1'), { name: 'Pol', score: 3 })
  })
})

describe('contenu', () => {
  it('un joueur ne peut pas lire les questions (ni leurs réponses)', async () => {
    await assertFails(getDoc(doc(player(), 'questions/q1')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'questions/q1')))
  })
  it("un admin lit et écrit les questions", async () => {
    await assertSucceeds(getDoc(doc(admin(), 'questions/q1')))
    await assertSucceeds(setDoc(doc(admin(), 'questions/q2'), { text: 'x' }))
  })
  it("un compte Google non admin ne peut rien modifier", async () => {
    const other = env.authenticatedContext('x', { email: 'pirate@gmail.com', email_verified: true }).firestore()
    await assertFails(setDoc(doc(other, 'themes/t1'), { name: 'x' }))
  })
  it('un admin ajouté dans la collection admins a les droits', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'admins/pote@gmail.com'), {}))
    const pote = env.authenticatedContext('pote', { email: 'pote@gmail.com', email_verified: true }).firestore()
    await assertSucceeds(setDoc(doc(pote, 'themes/t1'), { name: 'x' }))
  })
})

describe('sessions', () => {
  it('tout le monde voit les sessions, seul un admin les modifie', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'sessions/open')))
    await assertFails(updateDoc(doc(player(), 'sessions/open'), { status: 'done' }))
    await assertSucceeds(updateDoc(doc(admin(), 'sessions/open'), { status: 'done' }))
  })
  it('le mot de passe reste secret', async () => {
    await assertFails(getDoc(doc(player(), 'sessionSecrets/locked')))
  })
})

describe('rejoindre', () => {
  it('sans mot de passe : ok avec un score de 0 seulement', async () => {
    await assertSucceeds(setDoc(doc(player('p2'), 'sessions/open/participants/p2'), { name: 'Pil', score: 0 }))
    await assertFails(setDoc(doc(player('p3'), 'sessions/open/participants/p3'), { name: 'Triche', score: 100 }))
  })
  it("on ne peut pas s'inscrire à la place d'un autre", async () => {
    await assertFails(setDoc(doc(player('p2'), 'sessions/open/participants/p9'), { name: 'X', score: 0 }))
  })
  it('avec mot de passe : refusé sans la bonne clé', async () => {
    const db = player('p2')
    await assertFails(setDoc(doc(db, 'sessions/locked/participants/p2'), { name: 'Pil', score: 0 }))
    await assertFails(setDoc(doc(db, 'sessions/locked/keys/p2'), { key: 'faux' }))
    await assertSucceeds(setDoc(doc(db, 'sessions/locked/keys/p2'), { key: 'chut' }))
    await assertSucceeds(setDoc(doc(db, 'sessions/locked/participants/p2'), { name: 'Pil', score: 0 }))
  })
  it('un joueur peut changer son pseudo mais pas son score', async () => {
    const db = player('p1')
    await assertSucceeds(updateDoc(doc(db, 'sessions/open/participants/p1'), { name: 'Polo' }))
    await assertFails(updateDoc(doc(db, 'sessions/open/participants/p1'), { score: 999 }))
  })
})

describe('répondre', () => {
  const answer = (seq: number, pid = 'p1') => ({ seq, pid, name: 'Pol', at: Timestamp.now(), data: { choice: 1 } })
  it('ok pour la question en cours', async () => {
    await assertSucceeds(setDoc(doc(player('p1'), 'sessions/open/answers/5_p1'), answer(5)))
  })
  it('refusé pour une autre question ou au nom de quelqu’un d’autre', async () => {
    await assertFails(setDoc(doc(player('p1'), 'sessions/open/answers/4_p1'), answer(4)))
    await assertFails(setDoc(doc(player('p1'), 'sessions/open/answers/5_p2'), answer(5, 'p2')))
  })
  it("refusé si on n'a pas rejoint la session", async () => {
    await assertFails(setDoc(doc(player('p7'), 'sessions/open/answers/5_p7'), answer(5, 'p7')))
  })
  it('refusé une fois le temps écoulé', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'sessions/open'), { 'round.startedAt': Timestamp.fromMillis(Date.now() - 60_000) }),
    )
    await assertFails(setDoc(doc(player('p1'), 'sessions/open/answers/5_p1'), answer(5)))
  })
  it('refusé après la révélation', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'sessions/open'), { 'round.status': 'revealed' }))
    await assertFails(setDoc(doc(player('p1'), 'sessions/open/answers/5_p1'), answer(5)))
  })
  it('un joueur ne lit pas les réponses des autres', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'sessions/open/answers/5_p2'), answer(5, 'p2')))
    await assertFails(getDoc(doc(player('p1'), 'sessions/open/answers/5_p2')))
    await assertSucceeds(getDoc(doc(player('p1'), 'sessions/open/answers/5_p1')))
  })
  it('un joueur exclu ne peut plus répondre', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'sessions/open/participants/p1'), { kicked: true }))
    await assertFails(setDoc(doc(player('p1'), 'sessions/open/answers/5_p1'), answer(5)))
  })
})
