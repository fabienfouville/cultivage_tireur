import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Spinner } from './components/ui'
import { UpdateBanner } from './components/UpdateBanner'
import Home from './pages/Home'
import Player from './pages/Player'

// L'admin et l'écran (cartes, éditeur…) ne sont chargés que quand on en a besoin : les téléphones restent légers
const Screen = lazy(() => import('./pages/Screen'))
const Admin = lazy(() => import('./pages/admin/Admin'))
const Control = lazy(() => import('./pages/admin/Control'))

export default function App() {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/s/:sid" element={<Player />} />
          <Route path="/ecran/:sid" element={<Screen />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/session/:sid" element={<Control />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
