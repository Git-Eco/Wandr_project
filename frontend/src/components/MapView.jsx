import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useWikiPhoto } from '../hooks/useWikiPhoto'

const GOOGLE_TILES = 'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}'
const OSRM_TIMEOUT_MS = 6000
const ROUTE_COLOR  = '#FF6B00'   // vivid orange
const SHADOW_COLOR = 'rgba(180,60,0,0.25)'

// ── Spot popup with lazy photo ────────────────────────────────────────────────
function SpotPopup({ name, city, slot, stopLabel, isHotel }) {
  const { url, loading } = useWikiPhoto(name, city)
  return (
    <div style={{ minWidth: 160, maxWidth: 200, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Photo area */}
      <div style={{
        width: '100%', height: 110, borderRadius: 8, overflow: 'hidden',
        background: '#e8e8e8', marginBottom: 8, position: 'relative',
      }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#bbb',
          }}>⏳</div>
        )}
        {url && (
          <img src={url} alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        )}
        {!loading && !url && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 28, color: '#ccc',
          }}>{isHotel ? '🏨' : '📍'}</div>
        )}
      </div>
      {/* Text */}
      {stopLabel && (
        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {stopLabel}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.3 }}>{name}</div>
      {slot && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{slot}</div>}
    </div>
  )
}

// ── Custom pin marker ─────────────────────────────────────────────────────────
function makeIcon(color, label) {
  return L.divIcon({
    className: '',
    iconSize: [36, 48],
    iconAnchor: [18, 48],
    popupAnchor: [0, -48],
    html: `
      <div style="position:relative;width:36px;height:48px;display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:36px;height:36px;background:${color};
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          border:2.5px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);color:white;font-weight:800;font-size:12px;
            font-family:'DM Sans',sans-serif;line-height:1;">${label}</span>
        </div>
      </div>`,
  })
}

// ── FitBounds helper ──────────────────────────────────────────────────────────
function FitBounds({ spots }) {
  const map = useMap()
  useEffect(() => {
    if (!spots.length) return
    const bounds = L.latLngBounds(spots.map(s => [s.lat, s.lon]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [spots, map])
  return null
}

// ── Straight-line fallback ────────────────────────────────────────────────────
function StraightFallback({ orderedSpots }) {
  if (orderedSpots.length < 2) return null
  return orderedSpots.slice(0, -1).map((s, i) => (
    <Polyline
      key={i}
      positions={[[s.lat, s.lon], [orderedSpots[i + 1].lat, orderedSpots[i + 1].lon]]}
      color={ROUTE_COLOR}
      weight={3}
      opacity={0.65}
      dashArray="8 6"
    />
  ))
}

// ── Overview Map ──────────────────────────────────────────────────────────────
export function OverviewMap({ spots }) {
  if (!spots.length) return null

  const center = [
    spots.reduce((s, p) => s + p.lat, 0) / spots.length,
    spots.reduce((s, p) => s + p.lon, 0) / spots.length,
  ]

  const seen = {}
  let counter = 0
  spots.forEach(s => {
    const key = `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`
    if (!seen[key]) seen[key] = ++counter
  })

  return (
    <MapContainer
      key="overview"
      center={center}
      zoom={13}
      style={{ height: 460, width: '100%', borderRadius: 16 }}
    >
      <TileLayer url={GOOGLE_TILES} attribution="Google" />
      <FitBounds spots={spots} />
      {spots.map((s, i) => {
        const key = `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`
        const stopNum = seen[key]
        const [color, label] =
          s.category === 'Hotel' ? ['#D66F29', 'H']
          : s.category === 'Food' ? ['#c8860a', String(stopNum)]
          : ['#20878E', String(stopNum)]
        return (
          <Marker key={i} position={[s.lat, s.lon]} icon={makeIcon(color, label)}>
            <Popup>
              <SpotPopup
                name={s.name}
                city={s.city}
                slot={s.slot}
                stopLabel={`Stop ${stopNum} — Day ${s.day_num}`}
                isHotel={s.category === 'Hotel'}
              />
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}

// ── Day Map ───────────────────────────────────────────────────────────────────
export function DayMap({ spots, dayKey, onDistanceCalculated }) {
  // legs: array of { geometry: [[lat,lon],...], color }
  const [legs, setLegs]               = useState([])
  const [snappedWaypoints, setSnapped] = useState([])
  const [routeState, setRouteState]   = useState('loading')

  useEffect(() => {
    setRouteState('loading')
    setLegs([])
    setSnapped([])
    onDistanceCalculated?.(null)

    if (!spots.length) { setRouteState('fallback'); return }

    // Build ordered stop list: hotel first (if present), then non-hotel in slot order
    const hotel    = spots.find(s => s.category === 'Hotel')
    const nonHotel = spots.filter(s => s.category !== 'Hotel')

    // Full route order: hotel → stops → hotel (round trip back to hotel)
    const routeStops = hotel
      ? [hotel, ...nonHotel, hotel]
      : nonHotel

    if (routeStops.length < 2) {
      setRouteState('fallback')
      onDistanceCalculated?.(0)
      return
    }

    // Build OSRM waypoints string — include hotel for visual routing
    const coords = routeStops.map(s => `${s.lon},${s.lat}`).join(';')

    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      setRouteState('fallback')
      onDistanceCalculated?.(null)
    }, OSRM_TIMEOUT_MS)

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(data => {
        clearTimeout(timer)
        if (!data?.routes?.[0]) {
          setRouteState('fallback')
          onDistanceCalculated?.(null)
          return
        }

        const route = data.routes[0]
        const totalKm = route.distance / 1000

        // Each leg = travel between two consecutive waypoints
        // Collect all step geometries per leg and assign alternating colors
        const builtLegs = route.legs.map((leg, legIdx) => {
          const pts = []
          leg.steps.forEach(step => {
            step.geometry.coordinates.forEach(([lon, lat]) => {
              pts.push([lat, lon])
            })
          })
          return { geometry: pts }
        })

        // Snapped waypoints from OSRM
        const snapped = (data.waypoints ?? []).map(wp => [wp.location[1], wp.location[0]])

        setLegs(builtLegs)
        setSnapped(snapped)
        setRouteState('done')
        onDistanceCalculated?.(totalKm)
      })
      .catch(() => {
        clearTimeout(timer)
        setRouteState('fallback')
        onDistanceCalculated?.(null)
      })

    return () => { clearTimeout(timer); controller.abort() }
  }, [dayKey])

  if (!spots.length) return null

  const center = [
    spots.reduce((s, p) => s + p.lat, 0) / spots.length,
    spots.reduce((s, p) => s + p.lon, 0) / spots.length,
  ]

  // Build ordered spots for fallback and markers
  const hotel    = spots.find(s => s.category === 'Hotel')
  const nonHotel = spots.filter(s => s.category !== 'Hotel')
  const orderedForFallback = hotel ? [hotel, ...nonHotel, hotel] : nonHotel

  let stopNum = 1
  let hotelPinned = false
  const coordCount = {}

  return (
    <MapContainer
      key={dayKey}
      center={center}
      zoom={14}
      style={{ height: 420, width: '100%', borderRadius: 16 }}
    >
      <TileLayer url={GOOGLE_TILES} attribution="Google" />
      <FitBounds spots={spots} />

      {/* Shadow line underneath for depth */}
      {routeState === 'done' && legs.map((leg, i) => (
        leg.geometry.length >= 2 && (
          <Polyline
            key={`shadow-${i}`}
            positions={leg.geometry}
            color={SHADOW_COLOR}
            weight={10}
            opacity={1}
          />
        )
      ))}

      {/* Main route line — single vivid color */}
      {routeState === 'done' && legs.map((leg, i) => (
        leg.geometry.length >= 2 && (
          <Polyline
            key={`line-${i}`}
            positions={leg.geometry}
            color={ROUTE_COLOR}
            weight={5}
            opacity={0.95}
          />
        )
      ))}

      {/* Straight-line fallback */}
      {routeState === 'fallback' && (
        <StraightFallback orderedSpots={orderedForFallback} />
      )}

      {/* Dotted connectors: snapped road point → actual pin */}
      {routeState === 'done' && snappedWaypoints.map((snapped, i) => {
        const spot = orderedForFallback[i]
        if (!spot) return null
        const actual = [spot.lat, spot.lon]
        const dLat = Math.abs(snapped[0] - actual[0])
        const dLon = Math.abs(snapped[1] - actual[1])
        if (dLat < 0.0001 && dLon < 0.0001) return null // close enough, skip
        return (
          <Polyline
            key={`connector-${i}`}
            positions={[snapped, actual]}
            color={ROUTE_COLOR}
            weight={2}
            opacity={0.55}
            dashArray="5 7"
          />
        )
      })}

      {/* Stop markers */}
      {spots.map((s, i) => {
        const key = `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`
        const offsetIdx = coordCount[key] ?? 0
        coordCount[key] = offsetIdx + 1

        let lat = s.lat, lon = s.lon
        if (offsetIdx > 0) {
          const angle = (offsetIdx * 90 * Math.PI) / 180
          const dist  = 0.0003 * offsetIdx
          lat += dist * Math.cos(angle)
          lon += dist * Math.sin(angle)
        }

        if (s.category === 'Hotel') {
          if (hotelPinned) return null
          hotelPinned = true
          return (
            <Marker key={i} position={[lat, lon]} icon={makeIcon('#D66F29', 'H')}>
              <Popup>
                <SpotPopup name={s.name} city={s.city} isHotel={true} stopLabel="Your Hotel" />
              </Popup>
            </Marker>
          )
        }

        const color = s.category === 'Food' ? '#c8860a' : '#20878E'
        const n = stopNum++
        return (
          <Marker key={i} position={[lat, lon]} icon={makeIcon(color, String(n))}>
            <Popup>
              <SpotPopup name={s.name} city={s.city} slot={s.slot} stopLabel={`Stop ${n}`} />
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
