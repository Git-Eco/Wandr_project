import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'

const GOOGLE_TILES = 'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}'
const OSRM_TIMEOUT_MS = 6000
const ROUTE_COLOR = '#D66F29'

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

// ── Directional arrow marker ─────────────────────────────────────────────────
// Arrow SVG points North (up). We rotate it by the compass bearing so it
// points in the actual direction of travel along the road.
function makeArrowIcon(angleDeg) {
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `
      <svg width="22" height="22" viewBox="0 0 22 22"
           style="transform:rotate(${angleDeg}deg);display:block;overflow:visible;">
        <!-- Shadow -->
        <polygon points="11,2 19.5,18 11,13.5 2.5,18"
          fill="rgba(0,0,0,0.18)" transform="translate(1,1.5)"/>
        <!-- Arrow body -->
        <polygon points="11,2 19.5,18 11,13.5 2.5,18"
          fill="${ROUTE_COLOR}" stroke="white" stroke-width="1.5"
          stroke-linejoin="round"/>
      </svg>`,
  })
}

// ── Bearing calculation ───────────────────────────────────────────────────────
// Returns degrees clockwise from North (0 = up, 90 = right, 180 = down, 270 = left)
function getBearing(p1, p2) {
  const toRad = d => (d * Math.PI) / 180
  const lat1 = toRad(p1[0]), lat2 = toRad(p2[0])
  const dLon = toRad(p2[1] - p1[1])
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Sample arrow positions evenly from route geometry.
// Aims for ~5 arrows regardless of route length.
function sampleArrows(geometry, targetCount = 5) {
  if (!geometry || geometry.length < 4) return []
  const step = Math.max(3, Math.floor(geometry.length / (targetCount + 1)))
  const arrows = []
  for (let i = step; i < geometry.length - 1; i += step) {
    const angle = getBearing(geometry[i - 1], geometry[i])
    arrows.push({ pos: geometry[i], angle })
  }
  return arrows
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
function StraightLines({ spots }) {
  const nonHotel = spots.filter(s => s.category !== 'Hotel')
  if (nonHotel.length < 2) return null
  const positions = nonHotel.map(s => [s.lat, s.lon])
  return (
    <Polyline
      positions={positions}
      color={ROUTE_COLOR}
      weight={3}
      opacity={0.55}
      dashArray="8 6"
    />
  )
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
              <strong>Stop {stopNum} — Day {s.day_num}</strong><br />{s.slot}: {s.name}
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}

// ── Day Map ───────────────────────────────────────────────────────────────────
export function DayMap({ spots, dayKey, onDistanceCalculated }) {
  const [routeState, setRouteState]       = useState('loading')
  const [routeGeometry, setRouteGeometry] = useState(null)
  const [arrows, setArrows]               = useState([])

  useEffect(() => {
    setRouteState('loading')
    setRouteGeometry(null)
    setArrows([])
    onDistanceCalculated?.(null)

    const nonHotel = spots.filter(s => s.category !== 'Hotel')
    if (nonHotel.length < 2) {
      setRouteState('fallback')
      onDistanceCalculated?.(0)
      return
    }

    const coords     = nonHotel.map(s => `${s.lon},${s.lat}`).join(';')
    const controller = new AbortController()
    const timer      = setTimeout(() => {
      controller.abort()
      setRouteState('fallback')
      onDistanceCalculated?.(null)
    }, OSRM_TIMEOUT_MS)

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(data => {
        clearTimeout(timer)
        if (data?.routes?.[0]) {
          const pts = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon])
          const km  = data.routes[0].distance / 1000
          setRouteGeometry(pts)
          setArrows(sampleArrows(pts))
          setRouteState('done')
          onDistanceCalculated?.(km)
        } else {
          setRouteState('fallback')
          onDistanceCalculated?.(null)
        }
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

      {/* Road-snapped route */}
      {routeState === 'done' && routeGeometry && (
        <>
          {/* Subtle shadow line underneath for depth */}
          <Polyline
            positions={routeGeometry}
            color="rgba(0,0,0,0.15)"
            weight={7}
            opacity={1}
          />
          {/* Main route line */}
          <Polyline
            positions={routeGeometry}
            color={ROUTE_COLOR}
            weight={4}
            opacity={0.92}
          />
          {/* Directional arrows */}
          {arrows.map((a, i) => (
            <Marker
              key={i}
              position={a.pos}
              icon={makeArrowIcon(a.angle)}
              zIndexOffset={-10}
            />
          ))}
        </>
      )}

      {/* Straight-line fallback when OSRM times out */}
      {routeState === 'fallback' && <StraightLines spots={spots} />}

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
              <Popup><strong>🏨 {s.name}</strong></Popup>
            </Marker>
          )
        }

        const color = s.category === 'Food' ? '#c8860a' : '#20878E'
        const n = stopNum++
        return (
          <Marker key={i} position={[lat, lon]} icon={makeIcon(color, String(n))}>
            <Popup><strong>{s.slot}</strong><br />{s.name}</Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
