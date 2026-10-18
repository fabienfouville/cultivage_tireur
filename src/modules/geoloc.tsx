import { GeoMap, type MapPoint } from '../components/GeoMap'
import { distanceToCountryKm, haversineKm } from '../lib/geo'
import { CHOICE_COLORS, Locked, QuestionText, RevealList, Sent, ms, namesOf, parsePoints, podium } from './common'
import type { ModuleDef } from './types'

const km = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('fr-FR')) + ' km'

function revealPoints(round: { summary?: Record<string, any>; solution?: Record<string, any> }, names: Record<string, string>): MapPoint[] {
  const sol = round.solution
  const pts: MapPoint[] = (round.summary?.ranking ?? []).map((r: any, i: number) => ({
    lat: r.lat,
    lng: r.lng,
    label: `${names[r.pid] ?? '?'} · ${km(r.km)}`,
    color: CHOICE_COLORS[i % 4],
    linkTo: sol ? { lat: sol.lat, lng: sol.lng } : undefined,
  }))
  if (sol) pts.push({ lat: sol.lat, lng: sol.lng, label: '🎯 ' + (sol.label ?? ''), color: '#111' })
  return pts
}

export const geoloc: ModuleDef = {
  key: 'geoloc',
  name: 'Géoloc',
  icon: '🗺️',
  tagline: 'Ping sur la carte',
  rules: 'Place ton point sur la carte. Les plus proches gagnent (podium). Pour un pays : 0 km si tu es dedans.',
  defaults: { timer: 30, podium: '5,3,1' },
  configFields: [{ key: 'podium', label: 'Points du podium', type: 'text', help: 'ex : 5,3,1' }],
  questionFields: [
    { key: 'text', label: 'À trouver', type: 'text', placeholder: 'Où se trouve Oslo ?' },
    { key: 'answerHint', label: 'Réponse affichée', type: 'text', placeholder: 'Oslo (Norvège)' },
    { key: 'latlng', label: 'Position', type: 'latlng' },
  ],
  themeHasMap: true,
  summary: (q) => `${q.answerHint ?? ''} (${Number(q.lat).toFixed(2)}, ${Number(q.lng).toFixed(2)})${q.isoNum ? ' · pays ' + q.isoNum : ''}`,
  publicPayload: (q, { block }) => ({ text: q.text, mapId: block.mapIds?.[q.id] ?? block.mapId ?? 'world' }),
  solution: (q) => ({ lat: Number(q.lat), lng: Number(q.lng), label: q.answerHint ?? '', isoNum: q.isoNum ?? null }),
  score: async ({ q, answers, cfg }) => {
    const scored = []
    for (const a of answers) {
      const { lat, lng } = a.data
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      let d: number | null = null
      if (q.isoNum != null && q.isoNum !== '') d = await distanceToCountryKm(q.isoNum, lat, lng)
      if (d == null) d = haversineKm(lat, lng, Number(q.lat), Number(q.lng))
      scored.push({ pid: a.pid, lat, lng, km: d, at: ms(a) })
    }
    scored.sort((a, b) => a.km - b.km || a.at - b.at)
    const ranked = podium(scored, parsePoints(cfg.podium), (a, b) => Math.round(a.km) === Math.round(b.km))
    const results: Record<string, { pts: number; detail?: string }> = {}
    for (const r of ranked) results[r.pid] = { pts: r.pts, detail: km(r.km) }
    return {
      results,
      summary: { ranking: ranked.map(({ pid, lat, lng, km, rank }) => ({ pid, lat, lng, km, rank })) },
    }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const revealed = round.status === 'revealed'
    const mine: MapPoint[] = answer ? [{ lat: answer.data.lat, lng: answer.data.lng, label: 'Toi', color: '#e4572e' }] : []
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        <GeoMap
          mapId={round.public.mapId}
          height="55vh"
          points={revealed ? revealPoints(round, { [me.id]: 'Toi' }).filter((p) => p.label?.startsWith('Toi') || p.label?.startsWith('🎯')) : mine}
          onPick={!locked && !revealed ? (lat, lng) => void submit({ lat, lng }) : undefined}
        />
        {!answer && !locked && !revealed && <p className="center muted">Touche la carte pour placer ton point</p>}
        {answer && !locked && !revealed && <Sent>Point placé — touche ailleurs pour le déplacer</Sent>}
        {revealed && (
          <div className="big-answer">
            {round.solution?.label}
            <div className="muted small">{round.results?.[me.id]?.detail}</div>
          </div>
        )}
        {locked && !revealed && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => {
    const names = namesOf(participants)
    const revealed = round.status === 'revealed'
    return (
      <div className="geo-screen">
        <div>
          <QuestionText big>{round.public.text}</QuestionText>
          {revealed && (
            <>
              <div className="big-answer">{round.solution?.label}</div>
              <RevealList round={round} names={names} />
            </>
          )}
        </div>
        <GeoMap mapId={round.public.mapId} height="60vh" points={revealed ? revealPoints(round, names) : []} />
      </div>
    )
  },
}
