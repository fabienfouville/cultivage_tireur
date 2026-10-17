import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useState } from 'react'
import { db } from '../../firebase'
import { useCol } from '../../lib/hooks'
import { MODULES, getModule } from '../../modules'
import type { ModuleKey, Theme } from '../../types'

export interface Pack {
  id: string
  module: ModuleKey
  theme: string
  description?: string
  mapId?: string
  questions: Record<string, unknown>[]
}

/** Tous les packs du dossier content/packs (ajoutés au site à chaque déploiement) */
const PACKS: Pack[] = Object.values(import.meta.glob<Pack>('../../../content/packs/*.json', { eager: true, import: 'default' })).sort(
  (a, b) => MODULES.findIndex((m) => m.key === a.module) - MODULES.findIndex((m) => m.key === b.module) || a.theme.localeCompare(b.theme),
)

async function importPack(pack: Pack, existing?: Theme) {
  const batch = writeBatch(db)
  let themeId = existing?.id
  if (existing) {
    const old = await getDocs(query(collection(db, 'questions'), where('themeId', '==', existing.id)))
    old.docs.forEach((d) => batch.delete(d.ref))
  } else {
    const ref = doc(collection(db, 'themes'))
    themeId = ref.id
    batch.set(ref, {
      module: pack.module,
      name: pack.theme,
      packId: pack.id,
      createdAt: serverTimestamp(),
      ...(pack.mapId ? { mapId: pack.mapId } : {}),
    })
  }
  pack.questions.forEach((q, i) => {
    batch.set(doc(collection(db, 'questions')), {
      ...q,
      module: pack.module,
      themeId,
      createdAt: serverTimestamp(),
      ...(getModule(pack.module).ordered && q.order == null ? { order: i + 1 } : {}),
    })
  })
  await batch.commit()
}

export function PacksTab() {
  const themes = useCol<Theme>(collection(db, 'themes'), 'themes-all') ?? []
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const byPack = new Map(themes.filter((t) => t.packId).map((t) => [t.packId!, t]))

  return (
    <div className="stack">
      <p className="muted">
        Les packs sont des fichiers JSON du dossier <code>content/packs/</code> du repo (faciles à générer avec Claude). Importer un pack crée
        le thème et ses questions ; ré-importer remplace les questions du thème.
      </p>
      <div className="row wrap">
        <button
          className="btn"
          disabled={!!busy}
          onClick={async () => {
            setBusy('all')
            let n = 0
            for (const p of PACKS.filter((p) => !byPack.has(p.id))) {
              await importPack(p)
              n++
            }
            setMsg(`${n} pack(s) importé(s)`)
            setBusy(null)
          }}
        >
          📥 Importer tous les nouveaux packs
        </button>
        <ExportButton />
      </div>
      {msg && <p>{msg}</p>}
      <ul className="list">
        {PACKS.map((p) => {
          const mod = getModule(p.module)
          const existing = byPack.get(p.id)
          return (
            <li key={p.id} className="list-row">
              <div>
                <b>
                  {mod.icon} {p.theme}
                </b>
                <div className="muted small">
                  {mod.name} · {p.questions.length} questions{p.description && ` · ${p.description}`}
                </div>
              </div>
              <button
                className={'btn btn-small' + (existing ? '' : ' btn-primary')}
                disabled={!!busy}
                onClick={async () => {
                  if (existing && !confirm(`Remplacer les questions de « ${existing.name} » par celles du pack ?`)) return
                  setBusy(p.id)
                  try {
                    await importPack(p, existing)
                    setMsg(`« ${p.theme} » importé`)
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === p.id ? '…' : existing ? '↻ Ré-importer' : 'Importer'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Sauvegarde : télécharge thèmes + questions + config + grands jeux en JSON */
function ExportButton() {
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const out: Record<string, unknown[]> = {}
          for (const c of ['themes', 'questions', 'config', 'grandJeux']) {
            const snap = await getDocs(collection(db, c))
            out[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          }
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }))
          a.download = `cultivage-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
        } finally {
          setBusy(false)
        }
      }}
    >
      💾 Sauvegarder tout (JSON)
    </button>
  )
}
