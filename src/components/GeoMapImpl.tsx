import 'leaflet/dist/leaflet.css'
import { Fragment } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import { mapFor } from '../lib/geo'

export interface MapPoint {
  lat: number
  lng: number
  label?: string
  color?: string
  /** relier ce point à la bonne réponse */
  linkTo?: { lat: number; lng: number }
}

function ClickCatcher({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180) })
  return null
}

export function GeoMap({
  mapId,
  points = [],
  onPick,
  height = 360,
}: {
  mapId?: string
  points?: MapPoint[]
  onPick?: (lat: number, lng: number) => void
  height?: number | string
}) {
  const m = mapFor(mapId)
  return (
    <div className="geomap" style={{ height }}>
      <MapContainer
        key={mapId}
        center={m.center}
        zoom={m.zoom}
        minZoom={1}
        maxZoom={m.maxZoom ?? 12}
        worldCopyJump
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer url={m.tiles} attribution={m.attribution} />
        {onPick && <ClickCatcher onPick={onPick} />}
        {points.map((p, i) => (
          <Fragment key={i}>
            {p.linkTo && (
              <Polyline positions={[[p.lat, p.lng], [p.linkTo.lat, p.linkTo.lng]]} pathOptions={{ color: p.color ?? '#555', weight: 1, dashArray: '4 4' }} />
            )}
            <CircleMarker center={[p.lat, p.lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: p.color ?? '#2e86de', fillOpacity: 1 }}>
              {p.label && (
                <Tooltip permanent direction="top" offset={[0, -8]}>
                  {p.label}
                </Tooltip>
              )}
            </CircleMarker>
          </Fragment>
        ))}
      </MapContainer>
    </div>
  )
}
