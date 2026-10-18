import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, disableNetwork, enableNetwork, initializeFirestore } from 'firebase/firestore'

// Config publique du projet Firebase (ce n'est pas un secret : la sécurité est dans firestore.rules)
const firebaseConfig = {
  apiKey: 'AIzaSyC8XmP4SK8fypEJmHam52IIPqPVLa9U-AI',
  authDomain: 'cultivage-90317.firebaseapp.com',
  projectId: 'cultivage-90317',
  storageBucket: 'cultivage-90317.firebasestorage.app',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // Certains réseaux mobiles / proxys bloquent le flux temps réel : Firestore bascule alors tout seul en long-polling
  experimentalAutoDetectLongPolling: true,
})

// Un téléphone qui se met en veille perd sa connexion temps réel, et Firestore peut attendre de longues secondes
// avant de se reconnecter. Au réveil, on force une reconnexion immédiate pour recevoir la question en cours.
if (typeof document !== 'undefined') {
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (hiddenAt && Date.now() - hiddenAt > 3000) {
      disableNetwork(db)
        .then(() => enableNetwork(db))
        .catch(console.warn)
    }
  })
  window.addEventListener('online', () => void enableNetwork(db).catch(console.warn))
}

/** `npm run dev -- --mode emulator` ou VITE_EMULATORS=1 : tout passe par les émulateurs locaux */
export const useEmulators = import.meta.env.VITE_EMULATORS === '1'

if (useEmulators) {
  const host = location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
}
