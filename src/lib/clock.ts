import { doc, getDocFromServer, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { auth, db } from '../firebase'

// Les téléphones n'ont pas tous la même heure : on mesure l'écart avec l'horloge du serveur
// pour que tout le monde voie le même compte à rebours.
let offsetMs = 0
let measured: Promise<void> | null = null

export function serverNow(): number {
  return Date.now() + offsetMs
}

export function measureClock(): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return Promise.resolve()
  if (measured) return measured
  measured = (async () => {
    try {
      const ref = doc(db, 'clocks', uid)
      const sent = Date.now()
      await setDoc(ref, { t: serverTimestamp() })
      const snap = await getDocFromServer(ref)
      const received = Date.now()
      const t = snap.get('t') as Timestamp | null
      if (t) offsetMs = t.toMillis() - (sent + received) / 2
    } catch (e) {
      console.warn('clock', e)
      measured = null
    }
  })()
  return measured
}

export function useServerClock(intervalMs = 250): number {
  const [now, setNow] = useState(serverNow())
  useEffect(() => {
    void measureClock()
    const t = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Secondes restantes pour une question (peut être négatif). `factor` < 1 pour la carte Tortue */
export function remaining(startedAt: Timestamp | null | undefined, duration: number, now: number, factor = 1): number {
  if (!startedAt) return duration * factor
  return (startedAt.toMillis() + duration * factor * 1000 - now) / 1000
}
