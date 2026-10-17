import { useEffect, useState } from 'react'
import {
  onSnapshot,
  type DocumentReference,
  type Query,
} from 'firebase/firestore'

/** Abonnement temps réel à un document. `undefined` = en chargement, `null` = n'existe pas */
export function useDoc<T>(ref: DocumentReference | null, deps: unknown[] = []): T | null | undefined {
  const key = [ref?.path ?? null, ...deps].join('|')
  // On garde la clé avec la valeur : quand la clé change, l'ancienne valeur n'est jamais renvoyée
  const [state, setState] = useState<{ key: string; value: T | null | undefined }>({ key, value: undefined })
  useEffect(() => {
    if (!ref) {
      setState({ key, value: null })
      return
    }
    return onSnapshot(
      ref,
      (snap) => setState({ key, value: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null }),
      (err) => {
        console.error('useDoc', ref.path, err)
        setState({ key, value: null })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!ref) return null
  return state.key === key ? state.value : undefined
}

/** Abonnement temps réel à une requête. `undefined` = en chargement */
export function useCol<T>(q: Query | null, key: string, deps: unknown[] = []): T[] | undefined {
  const fullKey = [q ? key : null, ...deps].join('|')
  const [state, setState] = useState<{ key: string; value: T[] | undefined }>({ key: fullKey, value: undefined })
  useEffect(() => {
    if (!q) {
      setState({ key: fullKey, value: [] })
      return
    }
    return onSnapshot(
      q,
      (snap) => setState({ key: fullKey, value: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T) }),
      (err) => {
        console.error('useCol', key, err)
        setState({ key: fullKey, value: [] })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey])
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
