import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useState } from 'react'
import { Spinner } from '../../components/ui'
import { CARDS, CARD_KEYS } from '../../engine/cards'
import { db } from '../../firebase'
import { useCol, useDoc } from '../../lib/hooks'
import { MODULES, getModule, moduleConfig } from '../../modules'
import { ConfirmButton } from '../../components/ControlPanel'
import type { GrandJeu, GrandJeuSlot, ModuleKey, Theme } from '../../types'

/** Composer une soirée : une suite de modules (slots) avec phases cartes entre deux */
export function GrandJeuTab() {
  const gjs = useCol<GrandJeu>(query(collection(db, 'grandJeux'), orderBy('createdAt', 'desc')), 'gj-list')
  const [editing, setEditing] = useState<GrandJeu | 'new' | null>(null)
  if (!gjs) return <Spinner />
  if (editing)
    return (
      <GrandJeuEditor
        initial={editing === 'new' ? undefined : editing}
        onDone={() => setEditing(null)}
      />
    )
  return (
    <div className="stack">
      <button className="btn btn-primary" onClick={() => setEditing('new')}>
        + Nouveau Grand Jeu
      </button>
      <ul className="list">
        {gjs.map((g) => (
          <li key={g.id} className="list-row">
            <div>
              <b>{g.name}</b>
              <div className="muted small">
                {g.slots.map((s) => getModule(s.module).icon).join(' ')} · {g.slots.length} modules
                {g.cardsEnabled && ' · 🃏 cartes'}
              </div>
            </div>
            <div className="row">
              <button className="btn btn-small" onClick={() => setEditing(g)}>
                Modifier
              </button>
              <ConfirmButton className="btn btn-small btn-danger" confirmLabel="Supprimer ?" onConfirm={() => deleteDoc(doc(db, 'grandJeux', g.id))}>
                ×
              </ConfirmButton>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">Pour le lancer : ouvre la régie d'une session → « Grand Jeu » → Lancer.</p>
      <section className="card">
        <h3>🃏 Les cartes</h3>
        <p className="small muted">Chaque joueur a une carte de chaque. Entre deux modules, il peut en jouer une.</p>
        <ul className="small">
          {CARD_KEYS.map((k) => (
            <li key={k}>
              {CARDS[k].icon} <b>{CARDS[k].name}</b> : {CARDS[k].desc}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function GrandJeuEditor({ initial, onDone }: { initial?: GrandJeu; onDone: () => void }) {
  const themes = useCol<Theme>(collection(db, 'themes'), 'themes-all') ?? []
  const config = useDoc<Record<string, any>>(doc(db, 'config', 'modules'))
  const [name, setName] = useState(initial?.name ?? '')
  const [cardsEnabled, setCards] = useState(initial?.cardsEnabled ?? true)
  const [slots, setSlots] = useState<GrandJeuSlot[]>(initial?.slots ?? [])
  const upd = (i: number, patch: Partial<GrandJeuSlot>) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: number) =>
    setSlots((s) => {
      const n = [...s]
      const [x] = n.splice(i, 1)
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x)
      return n
    })

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault()
        const data = { name: name.trim(), cardsEnabled, slots }
        if (initial) await updateDoc(doc(db, 'grandJeux', initial.id), data)
        else await addDoc(collection(db, 'grandJeux'), { ...data, createdAt: serverTimestamp() })
        onDone()
      }}
    >
      <div className="row wrap">
        <input placeholder="Nom de la soirée" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="check">
          <input type="checkbox" checked={cardsEnabled} onChange={(e) => setCards(e.target.checked)} /> Cartes bonus/malus
        </label>
      </div>
      <ol className="slots">
        {slots.map((s, i) => {
          const list = themes.filter((t) => t.module === s.module).sort((a, b) => a.name.localeCompare(b.name))
          return (
            <li key={i} className="card slot">
              <div className="row wrap">
                <b>#{i + 1}</b>
                <select
                  value={s.module}
                  onChange={(e) => {
                    const module = e.target.value as ModuleKey
                    upd(i, { module, themeId: '', themeName: '', timer: moduleConfig(module, config).timer })
                  }}
                >
                  {MODULES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.icon} {m.name}
                    </option>
                  ))}
                </select>
                <select
                  value={s.themeId}
                  onChange={(e) => upd(i, { themeId: e.target.value, themeName: list.find((t) => t.id === e.target.value)?.name ?? '' })}
                >
                  <option value="">🎲 Au hasard</option>
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <label className="inline">
                  Q.
                  <input type="number" min={1} value={s.questionCount} onChange={(e) => upd(i, { questionCount: Number(e.target.value) })} />
                </label>
                <label className="inline">
                  s
                  <input type="number" min={3} value={s.timer} onChange={(e) => upd(i, { timer: Number(e.target.value) })} />
                </label>
                <span className="row">
                  <button type="button" className="btn btn-small" onClick={() => move(i, -1)} aria-label="Monter">
                    ↑
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => move(i, 1)} aria-label="Descendre">
                    ↓
                  </button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => setSlots((x) => x.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </span>
              </div>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className="btn"
        onClick={() => setSlots((s) => [...s, { module: 'qcm', themeId: '', themeName: '', questionCount: 10, timer: moduleConfig('qcm', config).timer }])}
      >
        + Ajouter un module
      </button>
      <div className="row">
        <button type="button" className="btn" onClick={onDone}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={!slots.length}>
          Enregistrer
        </button>
      </div>
    </form>
  )
}
