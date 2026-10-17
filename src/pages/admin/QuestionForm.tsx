import { useEffect, useState } from 'react'
import { GeoMap } from '../../components/GeoMap'
import { countryNames } from '../../lib/geo'
import { searchSongs, uploadFile, type Song } from '../../lib/media'
import type { ModuleDef, QuestionField } from '../../modules/types'
import type { Question } from '../../types'

type Draft = Record<string, any>

/** Formulaire d'une question, généré à partir des champs déclarés par le module */
export function QuestionForm({
  mod,
  initial,
  mapId,
  onSave,
  onCancel,
}: {
  mod: ModuleDef
  initial?: Partial<Question>
  mapId?: string
  onSave: (data: Draft) => Promise<void>
  onCancel: () => void
}) {
  const [d, setD] = useState<Draft>(() => ({ ...(initial ?? {}) }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }))

  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        const missing = mod.questionFields.find((f) => !('optional' in f && f.optional) && isEmpty(f, d))
        if (missing) return setError(`Champ manquant : ${missing.label}`)
        setBusy(true)
        try {
          await onSave(clean(mod, d))
        } catch (err: any) {
          setError(String(err?.message ?? err))
        } finally {
          setBusy(false)
        }
      }}
    >
      {mod.questionFields.map((f) => (
        <Field key={f.key} f={f} d={d} set={set} mapId={mapId} />
      ))}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={busy}>
          Enregistrer
        </button>
      </div>
    </form>
  )
}

function isEmpty(f: QuestionField, d: Draft) {
  if (f.type === 'choices4') return !Array.isArray(d[f.key]) || d[f.key].some((s: string) => !String(s ?? '').trim()) || d[f.correctKey] == null
  if (f.type === 'list') return !Array.isArray(d[f.key]) || d[f.key].length < 2
  if (f.type === 'latlng') return typeof d.lat !== 'number' || typeof d.lng !== 'number'
  if (f.type === 'bool') return false
  if (f.type === 'audio') return !d.audioUrl
  return d[f.key] == null || String(d[f.key]).trim() === ''
}

function clean(mod: ModuleDef, d: Draft): Draft {
  const out: Draft = {}
  for (const f of mod.questionFields) {
    if (f.type === 'choices4') {
      out[f.key] = (d[f.key] as string[]).map((s) => String(s).trim())
      out[f.correctKey] = Number(d[f.correctKey])
    } else if (f.type === 'latlng') {
      out.lat = d.lat
      out.lng = d.lng
      out.isoNum = d.isoNum ? Number(d.isoNum) : null
    } else if (f.type === 'number') {
      if (d[f.key] !== '' && d[f.key] != null) out[f.key] = Number(d[f.key])
    } else if (f.type === 'bool') out[f.key] = !!d[f.key]
    else if (f.type === 'list') out[f.key] = d[f.key]
    else if (d[f.key] != null) out[f.key] = typeof d[f.key] === 'string' ? d[f.key].trim() : d[f.key]
  }
  return out
}

function Field({ f, d, set, mapId }: { f: QuestionField; d: Draft; set: (k: string, v: unknown) => void; mapId?: string }) {
  switch (f.type) {
    case 'text':
    case 'url':
      return (
        <label>
          {f.label}
          <input value={d[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
        </label>
      )
    case 'textarea':
      return (
        <label>
          {f.label}
          <textarea rows={2} value={d[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
        </label>
      )
    case 'number':
      return (
        <label>
          {f.label}
          <input type="number" step="any" value={d[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
        </label>
      )
    case 'bool':
      return (
        <label className="check">
          <input type="checkbox" checked={!!d[f.key]} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}
        </label>
      )
    case 'choices4': {
      const arr: string[] = Array.isArray(d[f.key]) ? d[f.key] : ['', '', '', '']
      return (
        <fieldset>
          <legend>{f.label} (coche la bonne)</legend>
          {[0, 1, 2, 3].map((i) => (
            <div className="row" key={i}>
              <input type="radio" name={f.correctKey} checked={d[f.correctKey] === i} onChange={() => set(f.correctKey, i)} aria-label={`Bonne réponse ${i + 1}`} />
              <input
                value={arr[i] ?? ''}
                placeholder={`Réponse ${i + 1}`}
                onChange={(e) => {
                  const n = [...arr]
                  n[i] = e.target.value
                  set(f.key, n)
                }}
              />
            </div>
          ))}
        </fieldset>
      )
    }
    case 'list':
      return (
        <label>
          {f.label}
          <textarea
            rows={6}
            placeholder={f.placeholder}
            value={Array.isArray(d[f.key]) ? d[f.key].join('\n') : ''}
            onChange={(e) =>
              set(
                f.key,
                e.target.value.split('\n').map((s) => s.trimStart()).filter((s, i, a) => s || i === a.length - 1),
              )
            }
          />
        </label>
      )
    case 'image':
      return <ImageField f={f} d={d} set={set} />
    case 'audio':
      return <AudioField d={d} set={set} />
    case 'latlng':
      return <LatLngField d={d} set={set} mapId={mapId} />
  }
}

function ImageField({ f, d, set }: { f: QuestionField; d: Draft; set: (k: string, v: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <fieldset>
      <legend>{f.label}</legend>
      <input placeholder="https://… (lien direct vers l'image)" value={d[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
      <label className="small">
        ou envoyer un fichier{' '}
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setBusy(true)
            setErr('')
            try {
              set(f.key, await uploadFile('pixel', file))
            } catch (x: any) {
              setErr('Envoi impossible (Firebase Storage indisponible ?) : ' + (x?.message ?? x))
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
      {err && <p className="error small">{err}</p>}
      {d[f.key] && <img src={d[f.key]} alt="" className="preview" />}
    </fieldset>
  )
}

function AudioField({ d, set }: { d: Draft; set: (k: string, v: unknown) => void }) {
  const [term, setTerm] = useState('')
  const [songs, setSongs] = useState<Song[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <fieldset>
      <legend>Extrait audio</legend>
      <div className="row">
        <input placeholder="Chercher un titre ou un artiste…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <button
          type="button"
          className="btn"
          disabled={!term.trim()}
          onClick={() =>
            searchSongs(term)
              .then((s) => {
                setSongs(s)
                setErr(s.length ? '' : 'Aucun résultat')
              })
              .catch((e) => setErr(e.message))
          }
        >
          🔎
        </button>
      </div>
      {songs.length > 0 && (
        <ul className="songs">
          {songs.map((s) => (
            <li key={s.previewUrl}>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  set('audioUrl', s.previewUrl)
                  set('answerHintAuthor', s.artist)
                  set('answerHintTitle', s.title)
                  setSongs([])
                }}
              >
                Choisir
              </button>{' '}
              {s.artist} — {s.title}
            </li>
          ))}
        </ul>
      )}
      <input placeholder="ou lien direct vers un MP3" value={d.audioUrl ?? ''} onChange={(e) => set('audioUrl', e.target.value)} />
      <label className="small">
        ou envoyer un MP3{' '}
        <input
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setBusy(true)
            try {
              set('audioUrl', await uploadFile('blindtest', file))
            } catch (x: any) {
              setErr('Envoi impossible : ' + (x?.message ?? x))
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
      {err && <p className="error small">{err}</p>}
      {d.audioUrl && <audio src={d.audioUrl} controls preload="none" />}
    </fieldset>
  )
}

function LatLngField({ d, set, mapId }: { d: Draft; set: (k: string, v: unknown) => void; mapId?: string }) {
  const [countries, setCountries] = useState<{ iso: string; name: string }[]>([])
  useEffect(() => {
    countryNames().then(setCountries).catch(console.warn)
  }, [])
  return (
    <fieldset>
      <legend>Position de la réponse</legend>
      <GeoMap
        mapId={mapId}
        height={260}
        points={typeof d.lat === 'number' ? [{ lat: d.lat, lng: d.lng, label: '🎯' }] : []}
        onPick={(lat, lng) => {
          set('lat', Math.round(lat * 10000) / 10000)
          set('lng', Math.round(lng * 10000) / 10000)
        }}
      />
      <div className="row">
        <input type="number" step="any" placeholder="lat" value={d.lat ?? ''} onChange={(e) => set('lat', Number(e.target.value))} />
        <input type="number" step="any" placeholder="lng" value={d.lng ?? ''} onChange={(e) => set('lng', Number(e.target.value))} />
      </div>
      <label className="small">
        Si la réponse est un pays : 0 km pour tout clic à l'intérieur
        {/* key : on recrée la liste une fois les pays chargés pour que la valeur actuelle soit bien sélectionnée */}
        <select key={countries.length} value={d.isoNum ?? ''} onChange={(e) => set('isoNum', e.target.value ? Number(e.target.value) : null)}>
          <option value="">— pas un pays (distance au point) —</option>
          {countries.map((c) => (
            <option key={c.iso} value={Number(c.iso)}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}
