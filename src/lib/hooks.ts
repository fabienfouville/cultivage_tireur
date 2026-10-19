import { useEffect, useState } from 'react'
import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore'

/** Délai avant de se réabonner après une erreur (réseau coupé, jeton expiré…) */
const RETRY_MS = 3000

/** Abonnement temps réel à un document. `undefined` = en chargement, `null` = n'existe pas */
export function useDoc<T>(ref: DocumentReference | null, deps: unknown[] = []): T | null | undefined {
  const key = [ref?.path ?? null, ...deps].join('|')
  // On garde la clé avec la valeur : quand la clé change, l'ancienne valeur n'est jamais renvoyée
  const [state, setState] = useState<{ key: string; value: T | null | undefined }>({ key, value: undefined })
  // Un abonnement Firestore en erreur est mort : on en recrée un, sans effacer la dernière valeur connue
  // (avant, une erreur passagère affichait « session introuvable » ou le formulaire d'inscription)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!ref) {
      setState({ key, value: null })
      return
    }
    let retry: ReturnType<typeof setTimeout> | undefined
    const unsub = onSnapshot(
      ref,
      (snap) => setState({ key, value: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null }),
      (err) => {
        console.error('useDoc', ref.path, err)
        // Accès refusé : inutile d'insister. Sinon (réseau, serveur), on réessaie.
        if (err.code === 'permission-denied') setState({ key, value: null })
        else retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS)
      },
    )
    return () => {
      unsub()
      clearTimeout(retry)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])
  if (!ref) return null
  return state.key === key ? state.value : undefined
}

/** Abonnement temps réel à une requête. `undefined` = en chargement */
export function useCol<T>(q: Query | null, key: string, deps: unknown[] = []): T[] | undefined {
  const fullKey = [q ? key : null, ...deps].join('|')
  const [state, setState] = useState<{ key: string; value: T[] | undefined }>({ key: fullKey, value: undefined })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!q) {
      setState({ key: fullKey, value: [] })
      return
    }
    let retry: ReturnType<typeof setTimeout> | undefined
    const unsub = onSnapshot(
      q,
      (snap) => setState({ key: fullKey, value: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T) }),
      (err) => {
        console.error('useCol', key, err)
        if (err.code === 'permission-denied') setState({ key: fullKey, value: [] })
        else retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS)
      },
    )
    return () => {
      unsub()
      clearTimeout(retry)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey, attempt])
  if (!q) return []
  return state.key === fullKey ? state.value : undefined
}

/** Re-render régulier (pour les comptes à rebours) */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
