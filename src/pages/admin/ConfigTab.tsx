import { doc, setDoc } from 'firebase/firestore'
import { useState } from 'react'
import { Spinner } from '../../components/ui'
import { GENERAL_DEFAULTS, clearConfigCache, type GeneralConfig } from '../../engine/engine'
import { db } from '../../firebase'
import { useDoc } from '../../lib/hooks'
import { MODULES, moduleConfig } from '../../modules'

/** Réglages généraux du déroulement des questions — stockés dans config/general */
function GeneralSettings() {
  const stored = useDoc<Partial<GeneralConfig>>(doc(db, 'config', 'general'))
  const cur: GeneralConfig = { ...GENERAL_DEFAULTS, ...(stored ?? {}) }
  const save = async (patch: Partial<GeneralConfig>) => {
    await setDoc(doc(db, 'config', 'general'), { ...cur, ...patch })
    clearConfigCache()
  }
  if (stored === undefined) return null
  return (
    <fieldset className="card">
      <legend>⏱️ Déroulement des questions</legend>
      <label className="check">
        <input type="checkbox" checked={cur.autoClose} onChange={(e) => save({ autoClose: e.target.checked })} />
        Arrêter la question dès que tout le monde a répondu (sauf Thème, où l'on peut donner plusieurs réponses)
      </label>
      <label>
        Passage automatique à la question suivante, après la révélation (secondes, 0 = jamais)
        <input
          id="auto-next"
          type="number"
          min={0}
          defaultValue={cur.autoNext}
          onBlur={(e) => save({ autoNext: Math.max(0, Number(e.target.value) || 0) })}
        />
        <span className="muted small">L'animateur peut toujours mettre en pause ou passer plus vite depuis la régie.</span>
      </label>
    </fieldset>
  )
}

/** Réglages par défaut de chaque module (durée, points…) — stockés dans config/modules */
export function ConfigTab() {
  const stored = useDoc<Record<string, any>>(doc(db, 'config', 'modules'))
  const [draft, setDraft] = useState<Record<string, Record<string, any>>>({})
  const [saved, setSaved] = useState(false)
  if (stored === undefined) return <Spinner />

  const value = (key: string, field: string) => draft[key]?.[field] ?? moduleConfig(key, stored)[field] ?? ''
  const set = (key: string, field: string, v: unknown) => {
    setSaved(false)
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? {}), [field]: v } }))
  }

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault()
        const merged: Record<string, any> = {}
        for (const m of MODULES) {
          const cur = moduleConfig(m.key, stored)
          const { timerDefault: _legacy, ...rest } = { ...cur, ...(draft[m.key] ?? {}) } as Record<string, any>
          merged[m.key] = rest
        }
        await setDoc(doc(db, 'config', 'modules'), merged)
        clearConfigCache()
        setDraft({})
        setSaved(true)
      }}
    >
      <GeneralSettings />
      <div className="grid">
        {MODULES.map((m) => (
          <fieldset key={m.key} className="card">
            <legend>
              {m.icon} {m.name}
            </legend>
            <label>
              Temps par question (s)
              <input type="number" min={3} value={value(m.key, 'timer')} onChange={(e) => set(m.key, 'timer', Number(e.target.value))} />
            </label>
            {m.configFields.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type={f.type}
                  value={value(m.key, f.key)}
                  onChange={(e) => set(m.key, f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
                {f.help && <span className="muted small">{f.help}</span>}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <button className="btn btn-primary btn-big">{saved ? 'Enregistré ✓' : 'Enregistrer'}</button>
    </form>
  )
}
