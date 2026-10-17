import { lazy, Suspense, type ComponentProps } from 'react'

export type { MapPoint } from './GeoMapImpl'

// Leaflet n'est téléchargé que pour le module Géoloc
const Impl = lazy(() => import('./GeoMapImpl').then((m) => ({ default: m.GeoMap })))

export function GeoMap(props: ComponentProps<typeof Impl>) {
  return (
    <Suspense fallback={<div className="geomap" style={{ height: props.height ?? 360 }} />}>
      <Impl {...props} />
    </Suspense>
  )
}
