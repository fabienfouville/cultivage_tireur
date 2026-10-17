import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useState } from 'react'
import { db } from '../../firebase'
import { BUILTIN_ADMINS, useUser } from '../../lib/auth'
import { useCol } from '../../lib/hooks'

/** Gestion des admins (en plus de ceux écrits dans le code) */
export function SettingsTab() {
  const admins = useCol<{ id: string }>(collection(db, 'admins'), 'admins') ?? []
  const [email, setEmail] = useState('')
  const user = useUser()
  return (
    <div className="stack narrow">
      <section className="card">
        <h3>Animateurs (admins)</h3>
        <p className="muted small">Ils se connectent avec leur compte Google. Connecté en tant que {user?.email}.</p>
        <ul className="list">
          {BUILTIN_ADMINS.map((e) => (
            <li key={e} className="list-row">
              {e} <span className="muted small">(dans le code)</span>
            </li>
          ))}
          {admins.map((a) => (
            <li key={a.id} className="list-row">
              {a.id}
              <button className="btn btn-small btn-danger" onClick={() => confirm(`Retirer ${a.id} ?`) && deleteDoc(doc(db, 'admins', a.id))}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault()
            await setDoc(doc(db, 'admins', email.trim().toLowerCase()), { addedBy: user?.email ?? null, at: serverTimestamp() })
            setEmail('')
          }}
        >
          <input type="email" placeholder="email@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="btn btn-primary">Ajouter</button>
        </form>
      </section>
    </div>
  )
}
