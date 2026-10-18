import { app, useEmulators } from '../firebase'

/** Envoie un fichier sur Firebase Storage et renvoie son URL publique (Storage chargé à la demande) */
export async function uploadFile(folder: 'pixel' | 'blindtest', file: File): Promise<string> {
  const { connectStorageEmulator, getDownloadURL, getStorage, ref, uploadBytes } = await import('firebase/storage')
  const storage = getStorage(app)
  if (useEmulators && !(storage as any)._emulatorConnected) {
    connectStorageEmulator(storage, location.hostname, 9199)
    ;(storage as any)._emulatorConnected = true
  }
  const safe = file.name.replace(/[^\w.-]+/g, '_')
  const r = ref(storage, `${folder}/${Date.now()}_${safe}`)
  await uploadBytes(r, file, { contentType: file.type })
  return getDownloadURL(r)
}

export interface Song {
  artist: string
  title: string
  previewUrl: string
  artwork?: string
}

/**
 * Recherche d'extraits sur iTunes (30 s, gratuit, sans compte). Les liens d'extrait iTunes
 * restent valables, contrairement à ceux de Deezer qui expirent.
 * JSONP car l'API iTunes ne renvoie pas les en-têtes CORS.
 */
export function searchSongs(term: string): Promise<Song[]> {
  return new Promise((resolve, reject) => {
    const cb = `itunes_cb_${Date.now()}`
    const script = document.createElement('script')
    const cleanup = () => {
      delete (window as any)[cb]
      script.remove()
    }
    ;(window as any)[cb] = (data: any) => {
      cleanup()
      resolve(
        (data?.results ?? [])
          .filter((r: any) => r.previewUrl)
          .map((r: any) => ({ artist: r.artistName, title: r.trackName, previewUrl: r.previewUrl, artwork: r.artworkUrl60 })),
      )
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('Recherche iTunes indisponible'))
    }
    script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&country=FR&limit=10&callback=${cb}`
    document.head.appendChild(script)
  })
}

/** L'extrait se charge-t-il ? (les liens Deezer de l'ancienne app expirent au bout de quelques jours) */
export function canPlayAudio(url: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const a = new Audio()
    const done = (ok: boolean) => {
      clearTimeout(t)
      a.removeAttribute('src')
      resolve(ok)
    }
    const t = setTimeout(() => done(false), timeoutMs)
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(true)
    a.onerror = () => done(false)
    a.src = url
  })
}

/**
 * Renvoie un lien d'extrait qui fonctionne pour une question de blind test : le lien actuel s'il marche,
 * sinon un nouvel extrait iTunes trouvé avec l'artiste et le titre. null si rien trouvé.
 */
export async function ensurePlayableAudio(q: Record<string, any>): Promise<string | null> {
  const url = String(q.audioUrl ?? '')
  if (url && (await canPlayAudio(url))) return url
  const author = q.answerHintAuthor ?? ''
  const title = q.answerHintTitle ?? ''
  const term = [author, title].filter(Boolean).join(' ') || String(q.answerHint ?? '').replace(/[-—–]/g, ' ')
  if (!term.trim()) return url || null
  try {
    const songs = await searchSongs(term)
    return songs[0]?.previewUrl ?? (url || null)
  } catch {
    return url || null
  }
}
