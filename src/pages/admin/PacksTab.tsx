import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { useState } from 'react'
import { db } from '../../firebase'
import { useCol } from '../../lib/hooks'
import { MODULES, getModule } from '../../modules'
import { ConfirmButton } from '../../components/ControlPanel'
import type { GrandJeu, ModuleKey, Theme } from '../../types'

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

/** Un Grand Jeu prêt à l'emploi (content/grandjeux) : chaque jeu pointe vers un pack */
export interface GrandJeuFile {
  id: string
  name: string
  description?: string
  cardsEnabled: boolean
  slots: { module: ModuleKey; packId: string; questionCount: number; timer: number; extraPackId?: string; extraCount?: number; tokens?: number }[]
}

const GRAND_JEUX: GrandJeuFile[] = Object.values(
  import.meta.glob<GrandJeuFile>('../../../content/grandjeux/*.json', { eager: true, import: 'default' }),
)

/** Crée (ou met à jour) le Grand Jeu : importe d'abord les packs qui manquent, puis relie chaque jeu à son thème */
async function importGrandJeu(gj: GrandJeuFile, themes: Theme[]) {
  const byPack = new Map(themes.filter((t) => t.packId).map((t) => [t.packId!, t]))
  for (const packId of new Set(gj.slots.flatMap((s) => (s.extraPackId ? [s.packId, s.extraPackId] : [s.packId])))) {
    const pack = PACKS.find((p) => p.id === packId)
    if (!pack) throw new Error(`Pack introuvable : ${packId}`)
    // Packs déjà importés : on remplace leurs questions, pour que le Grand Jeu joue exactement le contenu du fichier
    byPack.set(packId, await importPack(pack, byPack.get(packId)))
  }
  const data = {
    name: gj.name,
    cardsEnabled: gj.cardsEnabled,
    gjFile: gj.id,
    slots: gj.slots.map((s) => {
      const t = byPack.get(s.packId)!
      const x = s.extraPackId ? byPack.get(s.extraPackId) : undefined
      return {
        module: s.module,
        themeId: t.id,
        themeName: t.name,
        questionCount: s.questionCount,
        timer: s.timer,
        ...(s.tokens ? { tokens: s.tokens } : {}),
        ...(x ? { extraThemeId: x.id, extraThemeName: x.name, extraCount: s.extraCount ?? 1 } : {}),
      }
    }),
  }
  const existing = await getDocs(query(collection(db, 'grandJeux'), where('gjFile', '==', gj.id)))
  if (existing.docs[0]) await updateDoc(existing.docs[0].ref, data)
  else await addDoc(collection(db, 'grandJeux'), { ...data, createdAt: serverTimestamp() })
}

async function importPack(pack: Pack, existing?: Theme): Promise<Theme> {
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
      // L'ordre du pack est conservé (jeux à difficulté croissante, et Grands Jeux qui jouent les questions dans l'ordre)
      ...(q.order == null ? { order: i + 1 } : {}),
    })
  })
  await batch.commit()
  return existing ?? ({ id: themeId!, module: pack.module, name: pack.theme, packId: pack.id } as Theme)
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
      <GrandJeuxFiles themes={themes} />
      <h3>Packs de questions</h3>
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
              <ConfirmButton
                className={'btn btn-small' + (existing ? '' : ' btn-primary')}
                disabled={!!busy}
                confirmLabel={existing ? 'Remplacer les questions ?' : 'Importer ?'}
                onConfirm={async () => {
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
              </ConfirmButton>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function GrandJeuxFiles({ themes }: { themes: Theme[] }) {
  const gjs = useCol<GrandJeu & { gjFile?: string }>(collection(db, 'grandJeux'), 'gj-all') ?? []
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  if (!GRAND_JEUX.length) return null
  return (
    <section className="card">
      <h3>🏁 Grands Jeux prêts à l'emploi</h3>
      <p className="muted small">Crée le Grand Jeu et importe les packs dont il a besoin. Il apparaît ensuite dans l'onglet Grand Jeu et dans la régie.</p>
      <ul className="list">
        {GRAND_JEUX.map((g) => {
          const done = gjs.some((x) => x.gjFile === g.id)
          return (
            <li key={g.id} className="list-row">
              <div>
                <b>{g.name}</b>
                <div className="muted small">
                  {g.slots.map((s) => getModule(s.module).icon).join(' ')} · {g.slots.length} jeux ·{' '}
                  {g.slots.reduce((n, s) => n + s.questionCount, 0)} questions{g.description && ` · ${g.description}`}
                </div>
              </div>
              <button
                className={'btn btn-small' + (done ? '' : ' btn-primary')}
                disabled={!!busy}
                onClick={async () => {
                  setBusy(g.id)
                  setMsg('')
                  try {
                    await importGrandJeu(g, themes)
                    setMsg(`« ${g.name} » est prêt : régie d'une session → Grand Jeu → Lancer`)
                  } catch (e: any) {
                    setMsg(`Erreur : ${e?.message ?? e}`)
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === g.id ? '…' : done ? '↻ Mettre à jour' : 'Créer le Grand Jeu'}
              </button>
            </li>
          )
        })}
      </ul>
      {msg && <p>{msg}</p>}
    </section>
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
