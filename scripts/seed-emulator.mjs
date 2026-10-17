// Charge une sauvegarde JSON (bouton « Sauvegarder tout » de l'admin) dans l'émulateur Firestore local.
// Usage : node scripts/seed-emulator.mjs chemin/vers/sauvegarde.json
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('Usage : node scripts/seed-emulator.mjs sauvegarde.json')
  process.exit(1)
}
const project = 'cultivage-90317'
const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`
const data = JSON.parse(readFileSync(file, 'utf8'))

const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return isoDate.test(v) ? { timestampValue: v } : { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } }
  if (typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v)
    return { timestampValue: new Date(v.seconds * 1000 + v.nanoseconds / 1e6).toISOString() }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } }
}

for (const col of ['config', 'themes', 'questions', 'grandJeux']) {
  const docs = data[col] ?? []
  const writes = docs.map(({ id, ...rest }) => ({
    update: { name: `projects/${project}/databases/(default)/documents/${col}/${id}`, fields: toValue(rest).mapValue.fields },
  }))
  for (let i = 0; i < writes.length; i += 400) {
    const res = await fetch(`${base}:batchWrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ writes: writes.slice(i, i + 400) }),
    })
    if (!res.ok) throw new Error(`${col}: ${res.status} ${await res.text()}`)
  }
  console.log(`${col}: ${docs.length}`)
}
