import type { Feature, MultiPolygon, Polygon } from 'geojson'

const R = 6371

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

type Ring = number[][]

let countriesPromise: Promise<Map<string, Feature<Polygon | MultiPolygon>>> | null = null

/** Polygones des pays (chargés à la demande, ~750 Ko) indexés par code ISO numérique sur 3 chiffres */
export function loadCountries() {
  countriesPromise ??= Promise.all([import('topojson-client'), import('world-atlas/countries-50m.json')]).then(
    ([topo, world]) => {
      const w = (world as any).default ?? world
      const fc = topo.feature(w, w.objects.countries) as any
      const map = new Map<string, Feature<Polygon | MultiPolygon>>()
      for (const f of fc.features) if (f.id != null) map.set(String(f.id).padStart(3, '0'), f)
      return map
    },
  )
  return countriesPromise
}

export async function countryNames(): Promise<{ iso: string; name: string }[]> {
  const map = await loadCountries()
  return [...map.entries()]
    .map(([iso, f]) => ({ iso, name: String((f.properties as any)?.name ?? iso) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function rings(f: Feature<Polygon | MultiPolygon>): Ring[][] {
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
}

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Distance (km) d'un point à un segment, en projection locale (suffisant pour un jeu) */
function segmentKm(lat: number, lng: number, a: number[], b: number[]): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180)
  const ky = 110.57
  const wrap = (d: number) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d)
  const ax = wrap(a[0] - lng) * kx
  const ay = (a[1] - lat) * ky
  const bx = wrap(b[0] - lng) * kx
  const by = (b[1] - lat) * ky
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0
  const px = ax + t * dx
  const py = ay + t * dy
  return Math.sqrt(px * px + py * py)
}

/** 0 si le point est dans le pays, sinon distance à la frontière la plus proche. null si pays inconnu */
export async function distanceToCountryKm(isoNum: unknown, lat: number, lng: number): Promise<number | null> {
  const f = (await loadCountries()).get(String(isoNum).padStart(3, '0'))
  if (!f) return null
  const polys = rings(f)
  for (const poly of polys) {
    if (inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole))) return 0
  }
  let best = Infinity
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        // On ne calcule finement que les segments proches (gain de temps sur les gros pays)
        if (Math.abs(ring[i][1] - lat) * 110 > best + 500 && Math.abs(ring[i - 1][1] - lat) * 110 > best + 500) continue
        best = Math.min(best, segmentKm(lat, lng, ring[i - 1], ring[i]))
      }
  return Number.isFinite(best) ? best : null
}

export interface MapDef {
  label: string
  center: [number, number]
  zoom: number
  tiles: string
  attribution: string
  maxZoom?: number
}

const CARTO = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
const CARTO_ATTR = '© OpenStreetMap, © CARTO'
const ESRI_PHYS = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}'
const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR = '© Esri'

/** Fonds de carte disponibles pour les thèmes Géoloc (champ `mapId` du thème) */
export const MAPS: Record<string, MapDef> = {
  world: { label: 'Monde (sans noms)', center: [20, 0], zoom: 2, tiles: CARTO, attribution: CARTO_ATTR },
  france: { label: 'France', center: [46.6, 2.4], zoom: 5, tiles: CARTO, attribution: CARTO_ATTR },
  europe: { label: 'Europe', center: [52, 12], zoom: 4, tiles: CARTO, attribution: CARTO_ATTR },
  usa: { label: 'États-Unis', center: [39, -97], zoom: 4, tiles: CARTO, attribution: CARTO_ATTR },
  africa: { label: 'Afrique', center: [2, 18], zoom: 3, tiles: CARTO, attribution: CARTO_ATTR },
  asia: { label: 'Asie', center: [32, 95], zoom: 3, tiles: CARTO, attribution: CARTO_ATTR },
  america: { label: 'Amériques', center: [8, -75], zoom: 2, tiles: CARTO, attribution: CARTO_ATTR },
  oceania: { label: 'Océanie', center: [-22, 145], zoom: 3, tiles: CARTO, attribution: CARTO_ATTR },
  summit: { label: 'Relief (sommets)', center: [25, 10], zoom: 2, tiles: ESRI_PHYS, attribution: ESRI_ATTR, maxZoom: 8 },
  satellite: { label: 'Satellite', center: [20, 0], zoom: 2, tiles: ESRI_SAT, attribution: ESRI_ATTR },
}

export function mapFor(id: unknown): MapDef {
  return MAPS[String(id)] ?? MAPS.world
}
