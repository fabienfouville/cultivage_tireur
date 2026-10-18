import { collection, doc, getCountFromServer, getDoc, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState, type ReactNode } from 'react'
import { CARDS } from '../engine/cards'
import * as E from '../engine/engine'
import { db } from '../firebase'
import { useCol, useDoc } from '../lib/hooks'
import { MAIN_MODULES, getModule, moduleConfig, variantsOf } from '../modules'
import { describeAnswer } from '../modules/common'
import { useServerClock } from '../lib/clock'
import type { Answer, GrandJeu, ModuleKey, Participant, Question, Session, Theme } from '../types'
import { Leaderboard } from './ui'

/** Exécute une action du moteur en affichant les erreurs */
function useAction(onDone?: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onDone?.()
    } catch (e: any) {
      console.error(e)
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

/** Bouton qui demande une confirmation dans la page (les fenêtres confirm() du navigateur bloquent certains outils) */
export function ConfirmButton({
  children,
  confirmLabel = 'Sûr ? Confirmer',
  onConfirm,
  className = 'btn',
  disabled,
}: {
  children: ReactNode
  confirmLabel?: string
  onConfirm: () => unknown
  className?: string
  disabled?: boolean
}) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 4000)
    return () => clearTimeout(t)
  }, [asking])
  return (
    <button
      className={className + (asking ? ' btn-confirm' : '')}
      disabled={disabled}
      onClick={() => {
        if (!asking) return setAsking(true)
        setAsking(false)
        void onConfirm()
      }}
    >
      {asking ? confirmLabel : children}
    </button>
  )
}

/**
 * La régie : tout ce qu'il faut pour animer, utilisable sur téléphone.
 * `onScreen` : version affichée sur l'écran projeté → jamais la bonne réponse ni les réponses en cours.
 */
export function ControlPanel({
  session,
  participants,
  compact,
  onScreen,
  onAction,
}: {
  session: Session
  participants: Participant[]
  compact?: boolean
  onScreen?: boolean
  /** appelé après chaque action réussie (ex. replier la régie de l'écran) */
  onAction?: () => void
}) {
  const { busy, error, run } = useAction(onAction)
  const sid = session.id
  const round = session.round
  const block = session.block

  return (
    <div className="control">
      {error && <p className="error">⚠️ {error}</p>}

      {session.phase === 'lobby' && <LobbyControls session={session} busy={busy} run={run} />}
      {session.phase === 'pick' && <BlockPicker session={session} busy={busy} run={run} />}
      {session.phase === 'cards' && (
        <section className="card">
          <h3>🃏 Phase cartes</h3>
          <CardPlaysAdmin session={session} participants={participants} />
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(() => E.endCardsPhase(sid))}>
            ▶️ Lancer le module maintenant
          </button>
        </section>
      )}
      {session.phase === 'play' && round && block && (
        <RoundControls session={session} participants={participants} busy={busy} run={run} onScreen={onScreen} />
      )}
      {session.phase === 'blockResults' && (
        <section className="card">
          <h3>Fin du module {block && getModule(block.module).name}</h3>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(() => E.afterBlock(sid))}>
            {session.mode === 'grandjeu'
              ? session.grandJeu && session.grandJeu.step + 1 >= session.grandJeu.slots.length
                ? '🏁 Classement final'
                : '➡️ Module suivant'
              : '🎡 Choisir le prochain jeu'}
          </button>
        </section>
      )}
      {session.phase === 'final' && (
        <section className="card">
          <h3>🏁 Partie terminée</h3>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => run(() => E.reopenSession(sid))}>
              Rejouer (roue libre)
            </button>
            {session.status !== 'done' && (
              <button className="btn btn-primary" disabled={busy} onClick={() => run(() => E.endSession(sid))}>
                Clôturer la session
              </button>
            )}
          </div>
        </section>
      )}

      {!compact && <PlayersAdmin session={session} participants={participants} />}

      {session.phase !== 'final' && session.phase !== 'lobby' && (
        <details className="card">
          <summary>Plus d'actions</summary>
          <div className="row wrap">
            {session.phase === 'play' && (
              <button className="btn" disabled={busy} onClick={() => run(() => E.endBlock(sid))}>
                ⏭️ Finir ce module
              </button>
            )}
            {session.mode === 'free' && session.phase !== 'pick' && (
              <button className="btn" disabled={busy} onClick={() => run(() => E.reopenSession(sid))}>
                🎡 Retour au choix du jeu
              </button>
            )}
            <ConfirmButton className="btn btn-danger" disabled={busy} confirmLabel="Sûr ? Terminer" onConfirm={() => run(() => E.endSession(sid))}>
              🏁 Terminer la partie
            </ConfirmButton>
          </div>
        </details>
      )}
    </div>
  )
}

type Run = (fn: () => Promise<unknown>) => Promise<void>

function LobbyControls({ session, busy, run }: { session: Session; busy: boolean; run: Run }) {
  const gjs = useCol<GrandJeu>(query(collection(db, 'grandJeux'), orderBy('createdAt', 'desc')), 'gj-list') ?? []
  const [gjId, setGjId] = useState('')
  const gj = gjs.find((g) => g.id === gjId)
  return (
    <section className="card">
      <h3>Lancer la partie</h3>
      <button className="btn btn-primary btn-block btn-big" disabled={busy} onClick={() => run(() => E.startFreeMode(session.id))}>
        🎡 En roue libre
      </button>
      <p className="muted small">Tu choisis les jeux au fur et à mesure.</p>
      <div className="row">
        <select value={gjId} onChange={(e) => setGjId(e.target.value)}>
          <option value="">— Grand Jeu —</option>
          {gjs.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.slots.length} modules)
            </option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={busy || !gj} onClick={() => gj && run(() => E.startGrandJeu(session.id, gj))}>
          🏁 Lancer
        </button>
      </div>
    </section>
  )
}

/** Roue libre : choix du module, du thème, du nombre de questions */
function BlockPicker({ session, busy, run }: { session: Session; busy: boolean; run: Run }) {
  const config = useDoc<Record<string, any>>(doc(db, 'config', 'modules'))
  const [module, setModule] = useState<ModuleKey | ''>(session.wheel?.module ?? '')
  useEffect(() => {
    if (session.wheel?.module) setModule(session.wheel.module)
  }, [session.wheel?.at])
  // Règles du jeu (ex. QCM classique, Mises, Duo/Carré/Cash) : mêmes questions
  const [variant, setVariant] = useState<ModuleKey | ''>('')
  const variants = module ? variantsOf(module) : []
  const played = (variant || module) as ModuleKey | ''
  const themes =
    useCol<Theme>(module ? query(collection(db, 'themes'), where('module', '==', module)) : null, `themes-${module}`, [module]) ?? []
  const [themeId, setThemeId] = useState('')
  const [available, setAvailable] = useState<number | null>(null)
  const cfg = played ? moduleConfig(played, config) : null
  const [count, setCount] = useState(10)
  const [order, setOrder] = useState<'keep' | 'random'>('random')
  const [timer, setTimer] = useState<number | ''>('')
  const [tokens, setTokens] = useState<number | ''>('')

  useEffect(() => {
    setThemeId('')
    setTimer('')
    setTokens('')
    setVariant('')
  }, [module])
  useEffect(() => {
    setAvailable(null)
    if (themeId === E.RANDOM_THEME || !module) return
    const filter = themeId === E.ALL_THEMES ? where('module', '==', module) : where('themeId', '==', themeId)
    getCountFromServer(query(collection(db, 'questions'), filter)).then((s) => {
      setAvailable(s.data().count)
      setCount((c) => Math.min(c || 10, s.data().count) || 1)
    })
  }, [themeId, module])

  const mod = played ? getModule(played) : null
  const effTimer = timer === '' ? cfg?.timer ?? 30 : timer
  return (
    <section className="card">
      <h3>🎡 Prochain jeu</h3>
      <div className="module-pick">
        {MAIN_MODULES.map((m) => (
          <button key={m.key} className={'chip-btn' + (module === m.key ? ' chip-on' : '')} onClick={() => setModule(m.key)}>
            {m.icon} {m.name}
          </button>
        ))}
      </div>
      <button className="btn btn-block" disabled={busy} onClick={() => run(() => E.spinWheel(session.id, MAIN_MODULES.map((m) => m.key)).then(setModule))}>
        🎰 Tourner la roue (affichée sur l'écran)
      </button>
      {mod && (
        <div className="form">
          {variants.length > 1 && (
            <label>
              Règles
              <select id="variant" value={played} onChange={(e) => setVariant(e.target.value as ModuleKey)}>
                {variants.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.variantName ?? v.name}
                  </option>
                ))}
              </select>
              <span className="muted small">{mod.rules}</span>
            </label>
          )}
          <label>
            Thème
            <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              <option value={E.ALL_THEMES}>🌍 Toutes les questions</option>
              <option value={E.RANDOM_THEME}>🎲 Un thème au hasard</option>
              {[...themes]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          {available != null && <p className="muted small">{available} question(s) {themeId === E.ALL_THEMES ? 'en tout' : 'dans ce thème'}</p>}
          <div className="row">
            <label>
              Questions
              <input type="number" min={1} max={available ?? 50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </label>
            <label>
              Temps (s)
              <input type="number" min={3} value={effTimer} onChange={(e) => setTimer(Number(e.target.value))} />
            </label>
          </div>
          {!mod.ordered && themeId !== E.ALL_THEMES && (
            <label>
              Ordre
              <select value={order} onChange={(e) => setOrder(e.target.value as 'keep' | 'random')}>
                <option value="random">Aléatoire (les moins jouées d'abord)</option>
                <option value="keep">Conservé</option>
              </select>
            </label>
          )}
          {played === 'gambling' && (
            <label>
              Jetons de départ
              <input
                type="number"
                min={1}
                placeholder={String(Number(cfg?.tokensPerQuestion ?? 3) * count)}
                value={tokens}
                onChange={(e) => setTokens(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
          )}
          <button
            className="btn btn-primary btn-block btn-big"
            disabled={busy}
            onClick={() =>
              run(() =>
                E.startBlock(session.id, {
                  module: played as ModuleKey,
                  themeId,
                  count,
                  order,
                  timer: Number(effTimer),
                  tokensStart: tokens === '' ? undefined : tokens,
                }),
              )
            }
          >
            ▶️ Lancer {mod.icon} {mod.name}
          </button>
        </div>
      )}
    </section>
  )
}

function RoundControls({
  session,
  participants,
  busy,
  run,
  onScreen,
}: {
  session: Session
  participants: Participant[]
  busy: boolean
  run: Run
  onScreen?: boolean
}) {
  const round = session.round!
  const block = session.block!
  const sid = session.id
  const mod = getModule(round.module)
  const [q, setQ] = useState<Question | null>(null)
  useEffect(() => {
    if (onScreen) return
    getDoc(doc(db, 'questions', round.qid)).then((s) => setQ(s.exists() ? ({ id: s.id, ...s.data() } as Question) : null))
  }, [round.qid, onScreen])
  const answers =
    useCol<Answer>(
      onScreen ? null : query(collection(db, 'sessions', sid, 'answers'), where('seq', '==', round.seq)),
      `ans-${round.seq}`,
      [round.seq],
    ) ?? []
  const now = useServerClock(500)
  const active = participants.filter((p) => !p.kicked && (!mod.canAnswer || mod.canAnswer(block, p.id)))
  const last = round.index + 1 >= round.total || !!mod.blockOver?.(block)
  const topAllFound = mod.multiTour && Object.keys(round.state?.found ?? {}).length >= (round.public.n ?? 0)
  const autoLeft = round.status === 'revealed' && round.autoNextAt ? Math.max(0, Math.ceil((round.autoNextAt.toMillis() - now) / 1000)) : null
  const byPid = new Map(answers.map((a) => [a.pid, a]))
  const nextLabel =
    mod.multiTour && !round.state?.ended ? '👀 Dévoiler tout le classement' : last ? '🏁 Résultats du module' : '➡️ Question suivante'

  return (
    <section className="card">
      <div className="muted small">
        {mod.icon} {mod.name} · {block.themeName} · question {round.index + 1}/{round.total}
        {mod.multiTour && ` · tour ${round.tour ?? 1}`}
      </div>
      <h3>{String(q?.text ?? round.public.text ?? '')}</h3>
      {/* Sur l'écran projeté, jamais la bonne réponse */}
      {!onScreen && q && <p className="solution">✅ {mod.summary(q)}</p>}
      <p className="small">
        {(round.answered ?? []).length}/{active.length} réponse(s)
        {round.status === 'answering' && !mod.multiAnswer && ' · arrêt automatique quand tout le monde a répondu'}
      </p>

      {round.status === 'answering' && (
        <div className="row wrap">
          <button className="btn" disabled={busy} onClick={() => run(() => E.addTime(sid, 10))}>
            +10 s
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(() => E.closeRound(sid, round.seq))}>
            ⏹ Stop, on corrige
          </button>
        </div>
      )}

      {round.status === 'validating' && <Validation session={session} participants={participants} />}
      {round.status === 'validating' && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(() => E.reveal(sid, round.seq))}>
          ✅ Valider et révéler
        </button>
      )}

      {round.status === 'revealed' && (
        <>
          {autoLeft != null && (
            <div className="row between auto-next">
              <span>Suite automatique dans {autoLeft} s</span>
              <button className="btn btn-small" onClick={() => run(() => E.pauseAutoNext(sid))}>
                ⏸ Pause
              </button>
            </div>
          )}
          <div className="row wrap">
            {mod.multiTour && !topAllFound && !round.state?.ended && (
              <button className="btn" disabled={busy} onClick={() => run(() => E.nextTour(sid))}>
                🔁 Nouveau tour
              </button>
            )}
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => E.next(sid, round.seq))}>
              {nextLabel}
            </button>
          </div>
        </>
      )}

      {/* Réponses en direct, avec le nom de chacun (pas sur l'écran projeté) */}
      {!onScreen && round.status !== 'validating' && (
        <div className="live-answers">
          <h4>Réponses en direct</h4>
          <ul>
            {active.map((p) => {
              const a = byPid.get(p.id)
              return (
                <li key={p.id} className={a ? '' : 'muted'}>
                  <b>{p.name}</b>
                  <span>{a ? (mod.describe ?? describeAnswer)(a.data, round) : '…'}</span>
                  {round.status === 'revealed' && round.results?.[p.id] && (
                    <span className="pts">{round.results[p.id].pts > 0 ? `+${round.results[p.id].pts}` : round.results[p.id].pts}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {round.status === 'answering' && (
        <button className="btn btn-small" disabled={busy} onClick={() => run(() => E.skip(sid))}>
          Passer cette question (sans points)
        </button>
      )}
    </section>
  )
}

/** Validation manuelle des réponses libres : cocher ce qui est juste */
function Validation({ session, participants }: { session: Session; participants: Participant[] }) {
  const nameOf = new Map(participants.map((p) => [p.id, p.name]))
  const round = session.round!
  const [items, setItems] = useState<ReturnType<NonNullable<ReturnType<typeof getModule>['validationItems']>>>([])
  const mod = getModule(round.module)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [answers, qs, config] = await Promise.all([
        E.getAnswers(session.id, round.seq),
        getDoc(doc(db, 'questions', round.qid)),
        E.getStoredConfig(),
      ])
      const q = { id: qs.id, ...qs.data() } as Question
      const list = mod.validationItems?.({ q, answers, round, block: session.block!, cfg: moduleConfig(round.module, config), participants: [] }) ?? []
      if (alive) setItems(list)
    })()
    return () => {
      alive = false
    }
  }, [round.seq])
  const groups = [...new Set(items.map((i) => i.group ?? ''))]
  return (
    <div className="validation">
      <p className="small muted">
        Coche les bonnes réponses (pré-cochées quand elles ressemblent à la réponse attendue). Tout le monde voit la correction en direct
        sur l'écran et les téléphones.
      </p>
      {groups.map((g) => {
        const list = items
          .filter((i) => (i.group ?? '') === g)
          .map((i) => {
            const on = round.verdicts?.[i.key] === true
            return (
              <button key={i.key} className={'verdict' + (on ? ' verdict-ok' : '')} onClick={() => E.setVerdict(session.id, i.key, !on)}>
                <span>{on ? '✅' : '⬜'}</span>
                <span className="verdict-label">{i.label}</span>
                {!!i.pids?.length && <span className="muted small">{i.pids.map((pid) => nameOf.get(pid) ?? '?').join(', ')}</span>}
              </button>
            )
          })
        // Les corrections manuelles (Le Top) sont repliées pour ne pas noyer l'écran
        if (g === 'Corriger à la main')
          return (
            <details key={g}>
              <summary className="small">{g}</summary>
              {list}
            </details>
          )
        return (
          <div key={g}>
            {g && <h4>{g}</h4>}
            {list}
          </div>
        )
      })}
    </div>
  )
}

function CardPlaysAdmin({ session, participants }: { session: Session; participants: Participant[] }) {
  const plays = useCol<{ id: string; pid: string; card: keyof typeof CARDS | null; target?: string }>(
    collection(db, 'sessions', session.id, 'cardPlays'),
    `cards-${session.id}`,
  ) ?? []
  const name = (pid?: string) => participants.find((p) => p.id === pid)?.name ?? '?'
  const now = plays.filter((p) => p.card && p.id.startsWith(`${session.blockCount}_`))
  if (!now.length) return <p className="muted small">Aucune carte jouée pour l'instant.</p>
  return (
    <ul className="small">
      {now.map((p) => (
        <li key={p.id}>
          {name(p.pid)} : {CARDS[p.card!].icon} {CARDS[p.card!].name}
          {p.target && ` → ${name(p.target)}`}
        </li>
      ))}
    </ul>
  )
}

function PlayersAdmin({ session, participants }: { session: Session; participants: Participant[] }) {
  const [edit, setEdit] = useState(false)
  const kicked = participants.filter((p) => p.kicked)
  return (
    <section className="card">
      <div className="row between">
        <h3>Joueurs ({participants.length - kicked.length})</h3>
        <button className="btn btn-small" onClick={() => setEdit(!edit)}>
          {edit ? 'OK' : '✏️ Modifier'}
        </button>
      </div>
      <Leaderboard
        participants={participants}
        extra={(p) =>
          edit ? (
            <span className="row">
              <button className="btn btn-small" onClick={() => E.adjustScore(session.id, p.id, -1)}>
                −1
              </button>
              <button className="btn btn-small" onClick={() => E.adjustScore(session.id, p.id, +1)}>
                +1
              </button>
              <ConfirmButton className="btn btn-small btn-danger" confirmLabel="Sûr ?" onConfirm={() => E.kick(session.id, p.id)}>
                Exclure
              </ConfirmButton>
            </span>
          ) : null
        }
      />
      {edit && kicked.length > 0 && (
        <p className="small">
          Exclus :{' '}
          {kicked.map((p) => (
            <button key={p.id} className="btn btn-small" onClick={() => E.kick(session.id, p.id, false)}>
              ↩️ {p.name}
            </button>
          ))}
        </p>
      )}
    </section>
  )
}
