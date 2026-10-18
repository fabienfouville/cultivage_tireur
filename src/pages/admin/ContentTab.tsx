import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Spinner } from '../../components/ui'
import { db } from '../../firebase'
import { MAPS } from '../../lib/geo'
import { useCol } from '../../lib/hooks'
import { MAIN_MODULES, getModule } from '../../modules'
import { mergeVariantThemes } from '../../engine/engine'
import type { ModuleKey, Question, Theme } from '../../types'
import { ConfirmButton } from '../../components/ControlPanel'
import { QuestionForm } from './QuestionForm'

/** Modules → thèmes → questions. La navigation est gardée dans l'URL (?m=…&t=…) */
export function ContentTab() {
  const [params, setParams] = useSearchParams()
  const m = params.get('m') as ModuleKey | null
  const t = params.get('t')
  const go = (next: { m?: string | null; t?: string | null }) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) v ? p.set(k, v) : p.delete(k)
    setParams(p)
  }
  if (m && t) return <ThemeView module={m} themeId={t} back={() => go({ t: null })} />
  if (m) return <ModuleView module={m} back={() => go({ m: null })} open={(id) => go({ t: id })} />
  return <ModuleGrid open={(key) => go({ m: key })} />
}

function ModuleGrid({ open }: { open: (k: string) => void }) {
  const themes = useCol<Theme>(collection(db, 'themes'), 'themes-all') ?? []
  const toMerge = themes.filter((t) => t.module === 'gambling' || t.module === 'duo-carre-cash').length
  const [merged, setMerged] = useState('')
  return (
    <>
      {toMerge > 0 && (
        <div className="card merge-banner">
          <p>
            <b>Gambling et Duo/Carré sont maintenant des variantes du QCM.</b> {toMerge} thème(s) sont encore rangés à part : regroupe-les
            dans le QCM pour que leurs questions servent aux 3 variantes. Rien n'est supprimé.
          </p>
          <ConfirmButton
            className="btn btn-primary"
            confirmLabel={`Regrouper ${toMerge} thème(s) ?`}
            onConfirm={async () => setMerged(`${await mergeVariantThemes()} thème(s) regroupé(s) dans le QCM`)}
          >
            Regrouper dans le QCM
          </ConfirmButton>
        </div>
      )}
      {merged && <p>✅ {merged}</p>}
      <h2>Choisir un module</h2>
      <p className="muted">Sélectionne le type de jeu pour gérer son contenu.</p>
      <div className="grid">
        {MAIN_MODULES.map((mod) => {
          const n = themes.filter((th) => th.module === mod.key).length
          return (
            <button key={mod.key} className="tile" onClick={() => open(mod.key)}>
              <span className="tile-icon">{mod.icon}</span>
              <b>{mod.name}</b>
              <span className="muted">{mod.tagline}</span>
              <span className="muted small">
                {n} {mod.themeHasMap ? 'carte' : 'thème'}
                {n > 1 ? 's' : ''}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function ModuleView({ module, back, open }: { module: ModuleKey; back: () => void; open: (id: string) => void }) {
  const mod = getModule(module)
  const themes = useCol<Theme>(query(collection(db, 'themes'), where('module', '==', module)), `themes-${module}`, [module])
  const questions = useCol<Question>(query(collection(db, 'questions'), where('module', '==', module)), `qs-${module}`, [module])
  const [name, setName] = useState('')
  const [mapId, setMapId] = useState('world')
  if (!themes || !questions) return <Spinner />
  const count = (id: string) => questions.filter((q) => q.themeId === id).length

  return (
    <div className="stack">
      <button className="btn btn-small" onClick={back}>
        ← Modules
      </button>
      <h2>
        {mod.icon} {mod.name}
      </h2>
      <p className="muted">{mod.rules}</p>
      <form
        className="row wrap"
        onSubmit={async (e) => {
          e.preventDefault()
          await addDoc(collection(db, 'themes'), {
            module,
            name: name.trim(),
            createdAt: serverTimestamp(),
            ...(mod.themeHasMap ? { mapId } : {}),
          })
          setName('')
        }}
      >
        <input placeholder="Nouveau thème" value={name} onChange={(e) => setName(e.target.value)} required />
        {mod.themeHasMap && (
          <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
            {Object.entries(MAPS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary">Créer</button>
      </form>
      <ul className="list">
        {[...themes]
          .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
          .map((th) => (
            <li key={th.id} className="list-row">
              <button className="link" onClick={() => open(th.id)}>
                <b>{th.name}</b>
                <span className="muted small">
                  {' '}
                  · {count(th.id)} question{count(th.id) > 1 ? 's' : ''}
                  {th.mapId && ` · carte ${MAPS[th.mapId]?.label ?? th.mapId}`}
                  {th.packId && ' · 📦 pack'}
                </span>
              </button>
              <ConfirmButton
                className="btn btn-small btn-danger"
                confirmLabel={`Supprimer ${count(th.id)} questions ?`}
                onConfirm={async () => {
                  const qs = await getDocs(query(collection(db, 'questions'), where('themeId', '==', th.id)))
                  const b = writeBatch(db)
                  qs.docs.forEach((d) => b.delete(d.ref))
                  b.delete(doc(db, 'themes', th.id))
                  await b.commit()
                }}
              >
                Supprimer
              </ConfirmButton>
            </li>
          ))}
      </ul>
    </div>
  )
}

function ThemeView({ module, themeId, back }: { module: ModuleKey; themeId: string; back: () => void }) {
  const mod = getModule(module)
  const themes = useCol<Theme>(query(collection(db, 'themes'), where('module', '==', module)), `themes-${module}`, [module]) ?? []
  const theme = themes.find((t) => t.id === themeId)
  const questions = useCol<Question>(query(collection(db, 'questions'), where('themeId', '==', themeId)), `qs-theme-${themeId}`, [themeId])
  const [editing, setEditing] = useState<Question | 'new' | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  if (!questions) return <Spinner />
  const sorted = [...questions].sort((a, b) => Number(a.order ?? 1e9) - Number(b.order ?? 1e9) || String(a.text).localeCompare(String(b.text)))

  return (
    <div className="stack">
      <button className="btn btn-small" onClick={back}>
        ← {mod.icon} {mod.name}
      </button>
      {renaming != null ? (
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault()
            await updateDoc(doc(db, 'themes', themeId), { name: renaming.trim() })
            setRenaming(null)
          }}
        >
          <input value={renaming} onChange={(e) => setRenaming(e.target.value)} autoFocus />
          <button className="btn btn-primary">OK</button>
        </form>
      ) : (
        <h2>
          {theme?.name ?? '…'}{' '}
          <button className="btn btn-small" onClick={() => setRenaming(theme?.name ?? '')}>
            Renommer
          </button>
        </h2>
      )}
      {mod.themeHasMap && theme && (
        <label className="row">
          Carte :
          <select value={theme.mapId ?? 'world'} onChange={(e) => updateDoc(doc(db, 'themes', themeId), { mapId: e.target.value })}>
            {Object.entries(MAPS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {editing === 'new' ? (
        <QuestionForm
          mod={mod}
          mapId={theme?.mapId}
          initial={mod.ordered ? { order: sorted.length + 1 } : undefined}
          onCancel={() => setEditing(null)}
          onSave={async (data) => {
            await addDoc(collection(db, 'questions'), { ...data, module, themeId, createdAt: serverTimestamp() })
            setEditing(null)
          }}
        />
      ) : (
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + Ajouter une question
        </button>
      )}

      <ol className="list">
        {sorted.map((q) =>
          editing !== 'new' && editing?.id === q.id ? (
            <li key={q.id}>
              <QuestionForm
                mod={mod}
                mapId={theme?.mapId}
                initial={q}
                onCancel={() => setEditing(null)}
                onSave={async (data) => {
                  await updateDoc(doc(db, 'questions', q.id), data)
                  setEditing(null)
                }}
              />
            </li>
          ) : (
            <li key={q.id} className="list-row">
              <div>
                <div>{String(q.text ?? '')}</div>
                <div className="muted small">
                  ✅ {mod.summary(q)}
                  {q.played ? ` · jouée ${q.played}×` : ''}
                </div>
              </div>
              <div className="row">
                <button className="btn btn-small" onClick={() => setEditing(q)}>
                  Modifier
                </button>
                <ConfirmButton className="btn btn-small btn-danger" confirmLabel="Supprimer ?" onConfirm={() => deleteDoc(doc(db, 'questions', q.id))}>
                  ×
                </ConfirmButton>
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  )
}
