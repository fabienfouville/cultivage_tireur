import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { auth, db, useEmulators } from '../firebase'

/**
 * Admins de base. On peut en ajouter d'autres depuis l'admin (onglet Réglages → collection `admins`).
 * ⚠️ Cette liste doit rester identique à celle de firestore.rules.
 */
export const BUILTIN_ADMINS = ['liloufe@gmail.com']

export function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(auth.currentUser ?? undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

/** Les joueurs ont un compte anonyme : il survit au rechargement de la page et à la mise en veille du téléphone */
export async function ensurePlayerAuth(): Promise<User> {
  if (auth.currentUser) return auth.currentUser
  const cred = await signInAnonymously(auth)
  return cred.user
}

export async function signInAdmin(): Promise<void> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e: any) {
    // Certains navigateurs mobiles bloquent les popups
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
    } else throw e
  }
}

/** Uniquement avec les émulateurs locaux : connexion admin sans Google */
export async function signInTestAdmin(email = 'liloufe@gmail.com'): Promise<void> {
  if (!useEmulators) throw new Error('Réservé aux émulateurs')
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({ sub: 'test-' + email, email, email_verified: true, name: email.split('@')[0] }),
  )
  await signInWithCredential(auth, credential)
}

export function logout() {
  return signOut(auth)
}

export async function checkAdmin(user: User | null | undefined): Promise<boolean> {
  const email = user?.email?.toLowerCase()
  if (!email || user?.isAnonymous) return false
  if (BUILTIN_ADMINS.includes(email)) return true
  try {
    return (await getDoc(doc(db, 'admins', email))).exists()
  } catch {
    return false
  }
}

/** undefined = vérification en cours */
export function useIsAdmin(): { user: User | null | undefined; isAdmin: boolean | undefined } {
  const user = useUser()
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    if (user === undefined) return
    let alive = true
    setIsAdmin(undefined)
    checkAdmin(user).then((ok) => alive && setIsAdmin(ok))
    return () => {
      alive = false
    }
  }, [user?.uid])
  return { user, isAdmin }
}
