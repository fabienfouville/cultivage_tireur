import { useState, type ReactNode } from 'react'
import { Spinner } from '../../components/ui'
import { useEmulators } from '../../firebase'
import { logout, signInAdmin, signInTestAdmin, useIsAdmin } from '../../lib/auth'

/** Affiche le contenu seulement pour un admin connecté (Google) */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useIsAdmin()
  const [error, setError] = useState('')

  if (user === undefined || (user && !user.isAnonymous && isAdmin === undefined)) return <Spinner />
  if (user && !user.isAnonymous && isAdmin) return <>{children}</>

  return (
    <div className="page narrow center">
      <h1>🌱 Cultivage — Admin</h1>
      {user && !user.isAnonymous ? (
        <>
          <p>
            Le compte <b>{user.email}</b> n'est pas administrateur.
          </p>
          <p className="muted small">Demande à un admin de t'ajouter dans l'onglet Réglages.</p>
          <button className="btn" onClick={() => logout()}>
            Changer de compte
          </button>
        </>
      ) : (
        <>
          <p className="muted">Connecte-toi avec ton compte Google d'animateur.</p>
          <button
            className="btn btn-primary btn-big"
            onClick={() => signInAdmin().catch((e) => setError(String(e?.message ?? e)))}
          >
            Se connecter avec Google
          </button>
          {useEmulators && (
            <button className="btn" onClick={() => signInTestAdmin().catch((e) => setError(String(e?.message ?? e)))}>
              🧪 Connexion admin de test (émulateur)
            </button>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
