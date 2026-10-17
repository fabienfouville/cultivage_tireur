import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore'

// Config publique du projet Firebase (ce n'est pas un secret : la sécurité est dans firestore.rules)
const firebaseConfig = {
  apiKey: 'AIzaSyC8XmP4SK8fypEJmHam52IIPqPVLa9U-AI',
  authDomain: 'cultivage-90317.firebaseapp.com',
  projectId: 'cultivage-90317',
  storageBucket: 'cultivage-90317.firebasestorage.app',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })

/** `npm run dev -- --mode emulator` ou VITE_EMULATORS=1 : tout passe par les émulateurs locaux */
export const useEmulators = import.meta.env.VITE_EMULATORS === '1'

if (useEmulators) {
  const host = location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
}
