import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON, Tooltip } from 'react-leaflet'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { useTheme, THEMES } from '../context/ThemeContext'
import { getProfile, updateProfile, deleteAccount } from '../api/client'
import { supabase } from '../supabase'
import TripCard from '../components/TripCard'
import TripCreatorModal from '../components/TripCreatorModal'
import { useWikiPhoto } from '../hooks/useWikiPhoto'
import styles from './Dashboard.module.css'

const ALL_PREFS = ['Sightseeing', 'Culture', 'Nature', 'History', 'Art', 'Food']

// ── Category SVG icons (1em × 1em, scales with parent font-size) ─────────────
const CatHotel       = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22V10l9-7 9 7v12"/><path d="M9 22v-5h6v5"/><rect x="9" y="8" width="2" height="2"/><rect x="13" y="8" width="2" height="2"/></svg>
const CatFood        = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 11v11M21 2v20M21 7H17a2 2 0 00-2 2v2h6"/></svg>
const CatSightseeing = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="13" r="4"/><circle cx="18" cy="13" r="4"/><path d="M10 13h4M6 9V5M18 9V5"/></svg>
const CatCulture     = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
const CatNature      = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22c3.5-3.5 5-8 4.5-13C11 7 16 10 17 17c-5 1-9 .5-15 5z"/><path d="M7 17l8-8"/></svg>
const CatHistory     = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
const CatArt         = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/><path d="M15 5l4 4"/></svg>

const PREF_ICONS = {
  Sightseeing: <CatSightseeing />, Culture: <CatCulture />,
  Nature:      <CatNature />,      History: <CatHistory />,
  Art:         <CatArt />,         Food:    <CatFood />,
}
const CAT_ICONS = {
  Hotel:       <CatHotel />,       Food:    <CatFood />,
  Sightseeing: <CatSightseeing />, Culture: <CatCulture />,
  Nature:      <CatNature />,      History: <CatHistory />,
  Art:         <CatArt />,
}

function getInitials(name, email) {
  if (name?.trim()) return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)
  return (email?.[0] ?? '?').toUpperCase()
}

// Deterministic rating 4.0–4.9 from location name
function getStarRating(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return (4.0 + (h % 10) / 10).toFixed(1)
}

function StarDisplay({ rating }) {
  const full  = Math.floor(rating)
  const half  = rating % 1 >= 0.5
  return (
    <span className={styles.stars}>
      {'★'.repeat(full)}{half ? '½' : ''}
      <span className={styles.ratingNum}>{rating}</span>
    </span>
  )
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ trips }) {
  const [offset, setOffset] = useState(0)
  const gridRef = useRef(null)
  const now         = new Date()
  const year        = new Date(now.getFullYear(), now.getMonth() + offset, 1).getFullYear()
  const month       = new Date(now.getFullYear(), now.getMonth() + offset, 1).getMonth()
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName   = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Exclude completed trips ──────────────────────────────────────────────────
  const activeTrips = useMemo(() =>
    trips.filter(t => t.status !== 'Completed' && t.start_date)
  , [trips])

  // ── Per-trip ranges clipped to this month ───────────────────────────────────
  const tripRanges = useMemo(() => {
    return activeTrips.map(t => {
      const s = new Date(t.start_date + 'T00:00:00')
      const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : new Date(s)
      const monthStart = new Date(year, month, 1)
      const monthEnd   = new Date(year, month, daysInMonth)
      if (e < monthStart || s > monthEnd) return null
      const startDay = s < monthStart ? 1 : s.getDate()
      const endDay   = e > monthEnd   ? daysInMonth : e.getDate()
      return { startDay, endDay }
    }).filter(Boolean)
  }, [activeTrips, year, month, daysInMonth])

  // ── Pill segments: split each range into per-week-row pieces ─────────────────
  const pillSegments = useMemo(() => {
    const segs = []
    tripRanges.forEach(({ startDay, endDay }) => {
      let ci = firstDay + startDay - 1
      const ciEnd = firstDay + endDay - 1
      while (ci <= ciEnd) {
        const rowEnd = Math.min(ciEnd, ci + (6 - (ci % 7)))
        segs.push({
          row:      Math.floor(ci / 7),
          colStart: ci % 7,
          colEnd:   rowEnd % 7,
        })
        ci = rowEnd + 1
      }
    })
    return segs
  }, [tripRanges, firstDay])

  // ── Endpoints: start & end days get filled circles ───────────────────────────
  const endpoints = useMemo(() => {
    const s = new Set()
    tripRanges.forEach(({ startDay, endDay }) => { s.add(startDay); s.add(endDay) })
    return s
  }, [tripRanges])

  // ── In-range: days between start and end get tinted circles ─────────────────
  const inRange = useMemo(() => {
    const s = new Set()
    tripRanges.forEach(({ startDay, endDay }) => {
      for (let d = startDay + 1; d < endDay; d++) s.add(d)
    })
    return s
  }, [tripRanges])

  const isToday = d => d === now.getDate() && month === now.getMonth() && year === now.getFullYear()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const CELL_PCT = 100 / 7

  return (
    <div className={styles.calendar}>
      <div className={styles.calHeader}>
        <button className={styles.calNav} onClick={() => setOffset(o => o - 1)}>‹</button>
        <span className={styles.calMonth}>{monthName}</span>
        <button className={styles.calNav} onClick={() => setOffset(o => o + 1)}>›</button>
      </div>

      {/* DOW labels */}
      <div className={styles.calDowRow}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className={styles.calDow}>{d}</div>
        ))}
      </div>

      {/* Data grid */}
      <div className={styles.calDataGrid} ref={gridRef}>

        {/* Pill overlays */}
        {pillSegments.map((seg, i) => {
          const INSET = 2
          const left  = `calc(${seg.colStart * CELL_PCT}% + ${INSET}px)`
          const right = `calc(${100 - (seg.colEnd + 1) * CELL_PCT}% + ${INSET}px)`
          const top   = `calc(${seg.row * 38}px + 2px)`
          return (
            <div
              key={i}
              className={styles.calPill}
              style={{ left, right, top }}
            />
          )
        })}

        {/* Day cells */}
        {cells.map((d, i) => (
          <div key={i} className={[
            styles.calCell,
            !d                                       ? styles.calEmpty    : '',
            d && isToday(d)                          ? styles.calToday    : '',
            d && endpoints.has(d)                    ? styles.calEndpoint : '',
            d && !endpoints.has(d) && inRange.has(d) ? styles.calInRange  : '',
          ].join(' ')}>
            <span>{d}</span>
          </div>
        ))}

      </div>
    </div>
  )
}

// ── Upcoming Trip Events ──────────────────────────────────────────────────────
const IconAlertSm = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const IconEditSm = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)

function getConflictIds(trips) {
  const ids = new Set()
  for (let i = 0; i < trips.length; i++) {
    for (let j = i + 1; j < trips.length; j++) {
      const a = trips[i], b = trips[j]
      const aStart = new Date(a.start_date + 'T00:00:00')
      const aEnd   = a.end_date ? new Date(a.end_date + 'T00:00:00') : aStart
      const bStart = new Date(b.start_date + 'T00:00:00')
      const bEnd   = b.end_date ? new Date(b.end_date + 'T00:00:00') : bStart
      if (aStart <= bEnd && bStart <= aEnd) { ids.add(a.id); ids.add(b.id) }
    }
  }
  return ids
}

function fmtDateRange(t) {
  const opts  = { month: 'short', day: 'numeric' }
  const start = new Date(t.start_date + 'T00:00:00')
  const end   = t.end_date ? new Date(t.end_date + 'T00:00:00') : null
  return end
    ? `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
    : start.toLocaleDateString('en-US', opts)
}

function UpcomingEvents({ trips, onTripClick }) {
  const upcoming = useMemo(() =>
    trips
      .filter(t => t.status === 'Upcoming' && t.start_date)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .slice(0, 3)
  , [trips])

  const conflictIds = useMemo(() => getConflictIds(upcoming), [upcoming])
  const hasConflicts = conflictIds.size > 0

  if (!upcoming.length) return (
    <div className={styles.noEvents}>No upcoming trips planned yet.</div>
  )

  return (
    <>
      {hasConflicts && (
        <div className={styles.conflictBanner}>
          <IconAlertSm />
          <span>{conflictIds.size} trip{conflictIds.size > 1 ? 's have' : ' has'} overlapping dates</span>
        </div>
      )}
      <div className={styles.tlList}>
        {upcoming.map((t, i) => {
          const isLast      = i === upcoming.length - 1
          const isConflict  = conflictIds.has(t.id)
          const daysUntil   = Math.max(0, Math.ceil(
            (new Date(t.start_date + 'T00:00:00') - Date.now()) / 86400000
          ))
          return (
            <div key={t.id} className={styles.tlItem}>
              {/* ── Spine ── */}
              <div className={styles.tlSpine}>
                <div className={[
                  styles.tlDot,
                  isConflict ? styles.tlDotConflict : '',
                  !isConflict && i === upcoming.length - 1 ? styles.tlDotFar : '',
                ].join(' ')} />
                {!isLast && (
                  <div className={`${styles.tlLine} ${isConflict ? styles.tlLineConflict : ''}`} />
                )}
              </div>
              {/* ── Body ── */}
              <div
                className={`${styles.tlBody} ${onTripClick && !isConflict ? styles.tlBodyClickable : ''}`}
                onClick={() => !isConflict && onTripClick?.(t.id)}
                role={onTripClick && !isConflict ? 'button' : undefined}
                tabIndex={onTripClick && !isConflict ? 0 : undefined}
                onKeyDown={onTripClick && !isConflict
                  ? e => e.key === 'Enter' && onTripClick(t.id)
                  : undefined}
              >
                <div className={styles.tlDate}>{fmtDateRange(t)}</div>
                <div className={styles.tlRow}>
                  <span className={styles.tlCity}>{t.city}</span>
                  {isConflict && (
                    <span className={styles.tlConflictBadge}>
                      <IconAlertSm /> Overlaps
                    </span>
                  )}
                </div>
                <div className={styles.tlSub}>
                  {t.days} day{t.days !== 1 ? 's' : ''} · "{t.title}"
                </div>
                {isConflict && onTripClick ? (
                  <button
                    className={styles.tlAdjustBtn}
                    onClick={e => { e.stopPropagation(); onTripClick(t.id) }}
                  >
                    <IconEditSm /> Adjust dates
                  </button>
                ) : (
                  <span className={styles.tlCountdown}>
                    {daysUntil === 0 ? 'Today!' : `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// Category gradient colors for rec cards
const CAT_GRADIENTS = {
  Sightseeing: 'linear-gradient(135deg,var(--primary),var(--light))',
  Culture:     'linear-gradient(135deg,#7c3aed,#a78bfa)',
  Nature:      'linear-gradient(135deg,#16a34a,#86efac)',
  History:     'linear-gradient(135deg,#92400e,#d97706)',
  Art:         'linear-gradient(135deg,#db2777,#f9a8d4)',
  Food:        'linear-gradient(135deg,#c8860a,#F3C375)',
}

// ── Place Detail Modal ────────────────────────────────────────────────────────
function PlaceDetailModal({ loc, index, onClose, onPlanSpot }) {
  const { url: photoUrl } = useWikiPhoto(loc.name, loc.city)
  const rating  = getStarRating(loc.name)
  const icon    = CAT_ICONS[loc.category] ?? '📍'
  const grad    = CAT_GRADIENTS[loc.category] ?? `linear-gradient(135deg, hsl(${(index*47+180)%360},50%,55%), hsl(${(index*47+220)%360},60%,40%))`

  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className={styles.placeModalOverlay} onClick={handleBackdrop}>
      <div className={styles.placeModal}>

        {/* ── Hero image ── */}
        <div className={styles.placeHero} style={{ background: grad }}>
          {photoUrl && (
            <img
              src={photoUrl}
              alt={loc.name}
              className={styles.placeHeroImg}
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          )}
          {!photoUrl && (
            <span className={styles.placeHeroIcon}>{icon}</span>
          )}
          {/* gradient fade into bottom sheet */}
          <div className={styles.placeHeroFade} />

          {/* Top controls */}
          <button className={styles.placeBackBtn} onClick={onClose} aria-label="Close">‹</button>
        </div>

        {/* ── Bottom sheet ── */}
        <div className={styles.placeSheet}>
          {/* Location line */}
          <div className={styles.placeLocation}>
            <span className={styles.placeLocationDot}>📍</span>
            {loc.city}
          </div>

          {/* Name */}
          <h2 className={styles.placeName}>{loc.name}</h2>

          {/* Pill row */}
          <div className={styles.placePills}>
            <span className={styles.placePill}>
              <span style={{ color: '#f59e0b' }}>★</span> {rating}
            </span>
            <span className={styles.placePill}>
              🌡 {loc.category}
            </span>
            <span className={styles.placePill}>
              {loc.cost === 0 ? '🎟 Free' : `💰 $${loc.cost}`}
            </span>
          </div>

          {/* Description */}
          <p className={styles.placeDesc}>
            {loc.description
              ? loc.description
              : `${loc.name} is a ${loc.category.toLowerCase()} destination in ${loc.city} that's worth adding to your itinerary. Explore its unique character and local atmosphere on your next visit.`
            }
          </p>

          {/* CTA */}
          <button
            className={styles.placePlanBtn}
            onClick={() => { onClose(); onPlanSpot(loc) }}
          >
            Plan a Trip Here ✈
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Recommended Places ────────────────────────────────────────────────────────
function RecCard({ loc, index, onSelect }) {
  const { url: photoUrl, loading: photoLoading } = useWikiPhoto(loc.name, loc.city)
  const rating = getStarRating(loc.name)
  const icon   = CAT_ICONS[loc.category] ?? '📍'
  const grad   = CAT_GRADIENTS[loc.category] ?? `linear-gradient(135deg, hsl(${(index*47+180)%360},50%,55%), hsl(${(index*47+220)%360},60%,40%))`

  return (
    <div className={styles.recCard} onClick={() => onSelect(loc)} style={{ cursor: 'pointer' }}>
      <div className={styles.recImgPlaceholder} style={{ background: grad }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={loc.name}
            className={styles.recPhoto}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <span className={styles.recCatIcon}>{photoLoading ? '' : icon}</span>
        )}
        <span className={styles.recCityOverlay}>{loc.city}</span>
      </div>
      <div className={styles.recBody}>
        <div className={styles.recName}>{loc.name}</div>
        <div className={styles.recCity}>📍 {loc.city}</div>
        <div className={styles.recFooter}>
          <StarDisplay rating={parseFloat(rating)} />
          <span className={styles.recCost}>
            {loc.cost === 0 ? 'Free' : `$${loc.cost}`}
          </span>
        </div>
        <div className={styles.recPlanLink}>View details →</div>
      </div>
    </div>
  )
}

function RecommendedPlaces({ locations, trips, preferences = [], onPlanSpot }) {
  const [selectedLoc, setSelectedLoc] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  const visited = useMemo(() => {
    const s = new Set()
    trips.forEach(t => t.spots?.forEach(sp => s.add(sp.name)))
    return s
  }, [trips])

  // Seed changes daily + on manual refresh — keeps recs stable within a session
  // but rotates them each new day automatically
  const seed = useMemo(() => {
    const dateStr = new Date().toDateString()
    let h = 5381
    for (const c of dateStr) h = ((h * 33) ^ c.charCodeAt(0)) & 0xffffffff
    return (h >>> 0) + refreshKey * 0x9e3779b9
  }, [refreshKey])

  const recs = useMemo(() => {
    const nonHotel = locations.filter(l => l.category !== 'Hotel' && !visited.has(l.name))

    // Score each location:
    //   +2 if its category matches one of the user's preferences
    //   +0–1 deterministic daily jitter (changes per day + per refresh)
    const scored = nonHotel.map(loc => {
      const prefScore = preferences.includes(loc.category) ? 2 : 0
      let h = seed
      for (const c of loc.name) h = ((h * 33) ^ c.charCodeAt(0)) & 0xffffffff
      const jitter = (h >>> 0) / 0xffffffff
      return { loc, score: prefScore + jitter }
    })

    scored.sort((a, b) => b.score - a.score)

    // City diversity: show at most 2 spots per city so the list stays varied
    const cityCounts = {}
    const result = []
    for (const { loc } of scored) {
      const n = cityCounts[loc.city] ?? 0
      if (n < 2) {
        result.push(loc)
        cityCounts[loc.city] = n + 1
      }
      if (result.length >= 8) break
    }
    return result
  }, [locations, visited, preferences, seed])

  if (!recs.length) return null

  return (
    <>
      <div className={styles.recGrid}>
        {recs.map((loc, i) => (
          <RecCard
            key={`${loc.name}-${seed}`}
            loc={loc}
            index={i}
            onSelect={loc => { setSelectedLoc(loc); setSelectedIndex(i) }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button
          className={styles.btnCGhost}
          onClick={() => setRefreshKey(k => k + 1)}
        >
          ··· More
        </button>
      </div>

      {selectedLoc && (
        <PlaceDetailModal
          loc={selectedLoc}
          index={selectedIndex}
          onClose={() => setSelectedLoc(null)}
          onPlanSpot={onPlanSpot}
        />
      )}
    </>
  )
}

// ── Ray-casting point-in-polygon ─────────────────────────────────────────────
function pointInRing(pt, ring) {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// ── Travel Choropleth ─────────────────────────────────────────────────────────
function TravelHeatmap({ trips, locations }) {
  const [geoData, setGeoData] = useState(null)
  const [geoError, setGeoError] = useState(false)

  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setGeoData)
      .catch(() => setGeoError(true))
  }, [])

  const { splitGeoData, countryTrips } = useMemo(() => {
    if (!geoData) return { splitGeoData: null, countryTrips: {} }

    const cityCoords = {}
    locations.forEach(l => { cityCoords[l.city] = [l.lon, l.lat] })

    // Set of "featureIdx-polyIdx" keys for polygons that contain a visited city
    const visitedPolygonKeys = new Set()
    const counts = {} // ISO key → trip count

    trips.forEach(t => {
      const coords = cityCoords[t.city]
      if (!coords) return
      geoData.features.forEach((feature, fi) => {
        const g = feature.geometry
        const polys = g.type === 'Polygon'
          ? [g.coordinates]
          : g.type === 'MultiPolygon' ? g.coordinates : []
        polys.forEach((poly, pi) => {
          if (pointInRing(coords, poly[0])) {
            visitedPolygonKeys.add(`${fi}-${pi}`)
            const key = feature.properties.ISO_A3 || feature.properties.name
            counts[key] = (counts[key] ?? 0) + 1
          }
        })
      })
    })

    // Build a new GeoJSON where each polygon is its own feature
    const features = []
    geoData.features.forEach((feature, fi) => {
      const g = feature.geometry
      const polys = g.type === 'Polygon'
        ? [g.coordinates]
        : g.type === 'MultiPolygon' ? g.coordinates : []
      polys.forEach((poly, pi) => {
        features.push({
          type: 'Feature',
          properties: {
            ...feature.properties,
            _visited: visitedPolygonKeys.has(`${fi}-${pi}`),
            _tripCount: visitedPolygonKeys.has(`${fi}-${pi}`)
              ? (counts[feature.properties.ISO_A3 || feature.properties.name] ?? 0)
              : 0,
          },
          geometry: { type: 'Polygon', coordinates: poly },
        })
      })
    })

    return {
      splitGeoData: { type: 'FeatureCollection', features },
      countryTrips: counts,
    }
  }, [geoData, trips, locations])

  const maxCount = Math.max(1, ...Object.values(countryTrips))
  const visitedCount = Object.keys(countryTrips).length

  if (!trips.length) return (
    <div className={styles.heatmapEmpty}>Plan your first trip to see your travel map!</div>
  )
  if (geoError) return (
    <div className={styles.heatmapEmpty}>Could not load map. Check your connection.</div>
  )
  if (!splitGeoData) return (
    <div className={styles.heatmapEmpty} style={{ display:'flex', alignItems:'center', gap:'0.5rem', justifyContent:'center' }}>
      <div className="spinner" style={{ width:18, height:18 }} /> Loading map…
    </div>
  )

  function styleFeature(feature) {
    const { _visited, _tripCount } = feature.properties
    if (!_visited) return {
      fillColor: 'transparent', fillOpacity: 0,
      color: '#ccc', weight: 0.4, opacity: 0.35,
    }
    const intensity = 0.35 + (_tripCount / maxCount) * 0.6
    return {
      fillColor: 'var(--primary)', fillOpacity: intensity,
      color: 'var(--primary-dark)', weight: 1.5, opacity: 0.85,
    }
  }

  function onEachFeature(feature, layer) {
    if (!feature.properties._visited) return
    const name  = feature.properties.ADMIN || feature.properties.name || 'Unknown'
    const count = feature.properties._tripCount
    layer.bindTooltip(
      `<strong>${name}</strong><br/>${count} trip${count > 1 ? 's' : ''}`,
      { sticky: true }
    )
  }

  // Strict world bounds — prevents the map from looping/repeating
  const worldBounds = [[-90, -180], [90, 180]]

  return (
    <>
      {visitedCount > 0 && (
        <div className={styles.choroplethSummary}>
          You've visited <strong>{visitedCount}</strong> countr{visitedCount > 1 ? 'ies' : 'y'}
        </div>
      )}
      <MapContainer
        key="choropleth"
        center={[20, 10]}
        zoom={2}
        minZoom={1}
        maxZoom={6}
        maxBounds={worldBounds}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        style={{ height: 280, width: '100%', borderRadius: 14 }}
        scrollWheelZoom={false}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution="CartoDB"
          noWrap={true}
          bounds={worldBounds}
        />
        <GeoJSON
          key={JSON.stringify(countryTrips)}
          data={splitGeoData}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
    </>
  )
}

// ── Explorer tier config ──────────────────────────────────────────────────────
const EXPLORER_TIERS = [
  { name: 'New Explorer', next: 'Traveller',      from: 0,  to: 1  },
  { name: 'Traveller',    next: 'Adventurer',     from: 1,  to: 5  },
  { name: 'Adventurer',   next: 'World Explorer', from: 5,  to: 15 },
  { name: 'World Explorer', next: null,           from: 15, to: Infinity },
]

function useExplorerInfo(total) {
  return useMemo(() => {
    let tier = EXPLORER_TIERS[0]
    for (const t of EXPLORER_TIERS) { if (total >= t.from) tier = t }
    const maxed = tier.to === Infinity
    const pct   = maxed ? 100 : Math.round(((total - tier.from) / (tier.to - tier.from)) * 100)
    const label = maxed ? 'Max level reached!' : `${total} / ${tier.to} trips`
    return { name: tier.name, next: tier.next, pct, label, maxed }
  }, [total])
}

// ── Next trip info (upcoming or ongoing) ──────────────────────────────────────
function useNextTripInfo(trips) {
  return useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Ongoing: trip has started and hasn't ended yet
    const ongoing = trips.find(t => {
      if (!t.start_date || t.status === 'Completed') return false
      const s = new Date(t.start_date + 'T00:00:00')
      const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : new Date(s)
      return s <= today && today <= e
    })
    if (ongoing) {
      const s         = new Date(ongoing.start_date + 'T00:00:00')
      const e         = ongoing.end_date ? new Date(ongoing.end_date + 'T00:00:00') : new Date(s)
      const dayNum    = Math.round((today - s) / 86_400_000) + 1
      const totalDays = Math.round((e - s) / 86_400_000) + 1
      return { trip: ongoing, type: 'ongoing', dayNum, totalDays }
    }

    // Upcoming: nearest future trip
    const next = trips
      .filter(t => t.start_date && t.status === 'Upcoming')
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0]
    if (!next) return null

    const s         = new Date(next.start_date + 'T00:00:00')
    const daysUntil = Math.round((s - today) / 86_400_000)
    const spots     = next.spots?.length ?? 0
    const dateStr   = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { trip: next, type: 'upcoming', daysUntil, spots, dateStr }
  }, [trips])
}

// ── Stat row SVG icons ────────────────────────────────────────────────────────
const IconMap   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/></svg>
const IconCheck = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconCal   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>

// ── UI / nav SVG icons ────────────────────────────────────────────────────────
const IconHome     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconSuitcase = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
const IconGear     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
const IconCalLg    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const IconList     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
const IconStar     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
const IconGlobe    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
const IconUser     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IconCircle   = ({ color }) => <svg width="10" height="10" viewBox="0 0 10 10" fill={color ?? 'currentColor'}><circle cx="5" cy="5" r="5"/></svg>
const IcoLock      = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>

const STAT_ROWS = [
  { Icon: IconMap,   bg: 'color-mix(in srgb, var(--primary) 12%, white)', color: 'var(--primary-dark)', label: 'Total trips' },
  { Icon: IconCheck, bg: 'color-mix(in srgb, var(--primary) 8%, white)', color: 'var(--primary)', label: 'Completed'   },
  { Icon: IconCal,   bg: 'color-mix(in srgb, var(--orange) 12%, white)', color: 'var(--orange-dark)', label: 'Upcoming'    },
]

// ── Profile Panel (right) ─────────────────────────────────────────────────────
function ProfilePanel({ profile, user, trips, onEditProfile }) {
  const { signOut } = useApp()
  const total      = trips.length
  const completed  = trips.filter(t => t.status === 'Completed').length
  const upcomingN  = trips.filter(t => t.status === 'Upcoming').length
  const initials   = getInitials(profile?.name, user?.email)
  const cityCounts = trips.reduce((acc, t) => ({ ...acc, [t.city]: (acc[t.city] ?? 0) + 1 }), {})
  const topCity    = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]

  const explorer   = useExplorerInfo(total)
  const nextTrip   = useNextTripInfo(trips)

  return (
    <div className={styles.rightPanel}>

      {/* ── Avatar + name + progress bar (all one card) ── */}
      <div className={styles.profileCard}>
        <div className={styles.profileAvatarWrap}>
          <div className={styles.profileAvatar}>{initials}</div>
          <button className={styles.editAvatarBtn} onClick={onEditProfile} title="Edit profile"><IconEditSm /></button>
        </div>
        <div className={styles.profileName}>
          {profile?.name?.trim() || <span className={styles.noName}>Add your name</span>}
        </div>
        <div className={styles.profileEmail}>{user?.email}</div>
        <div className={styles.profileBadge}>✈️ {explorer.name}</div>

        {/* Progress bar — white text since profileCard uses the hero gradient */}
        <div style={{ marginTop: 12, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
              {explorer.name}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              {explorer.label}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: 'rgba(255,255,255,0.85)',
              width: `${explorer.pct}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>
          {!explorer.maxed && (
            <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
              → {explorer.next}
            </div>
          )}
        </div>
      </div>

      {/* ── Stat rows ── */}
      <div className={styles.panelSection} style={{ marginBottom: '0.4rem' }}>
        <div className={styles.panelLabel}>Travel Stats</div>
        {STAT_ROWS.map(({ Icon, bg, color, label }, i) => {
          const val = [total, completed, upcomingN][i]
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3px 0' }}>
              <div style={{
                width: 27, height: 27, borderRadius: 7, flexShrink: 0,
                background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon />
              </div>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{val}</span>
            </div>
          )
        })}
        {topCity && (
          <div className={styles.topCity}>
            📍 Favourite: <strong>{topCity[0]}</strong>
          </div>
        )}
      </div>

      {/* ── Next trip countdown ── */}
      {nextTrip && (
        <div className={styles.panelSection} style={{ marginBottom: '0.4rem' }}>
          <div className={styles.panelLabel}>
            {nextTrip.type === 'ongoing' ? 'Currently travelling' : 'Next trip'}
          </div>

          {nextTrip.type === 'ongoing' ? (
            <div style={{ background: 'color-mix(in srgb, var(--primary) 12%, var(--bg-card))', border: '0.5px solid color-mix(in srgb, var(--primary) 35%, transparent)', borderRadius: 10, padding: '9px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--primary) 35%, transparent)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>Live now</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 1 }}>{nextTrip.trip.city}</div>
              <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 8 }}>"{nextTrip.trip.title}"</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-soft)', marginBottom: 4 }}>
                <span>Day {nextTrip.dayNum} of {nextTrip.totalDays}</span>
                <span>{Math.round((nextTrip.dayNum / nextTrip.totalDays) * 100)}% complete</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: 'color-mix(in srgb, var(--primary) 20%, var(--bg-subtle))', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, background: 'var(--primary)', width: `${Math.round((nextTrip.dayNum / nextTrip.totalDays) * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--color-background-secondary)', borderRadius: 10, padding: '9px 11px' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 1 }}>{nextTrip.trip.city}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                ✈ {nextTrip.trip.title} · {nextTrip.dateStr}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {[
                  { val: nextTrip.daysUntil === 0 ? '🎉' : nextTrip.daysUntil, label: nextTrip.daysUntil === 0 ? 'today!' : 'days away' },
                  { val: nextTrip.trip.days ?? '—', label: 'day trip' },
                  { val: nextTrip.spots, label: 'spots' },
                ].map(({ val, label }) => (
                  <div key={label} style={{ flex: 1, textAlign: 'center', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 7, padding: '5px 3px' }}>
                    <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Interests ── */}
      {profile?.preferences?.length > 0 && (
        <div className={styles.panelSection} style={{ marginBottom: '0.4rem' }}>
          <div className={styles.panelLabel}>Your Interests</div>
          <div className={styles.panelInterestRow}>
            {profile.preferences.map(p => (
              <span key={p} className={styles.panelInterestChip} title={p}>
                {PREF_ICONS[p]}
              </span>
            ))}
          </div>
        </div>
      )}

      <button className={`${styles.btnAMuted} ${styles.btnFull} ${styles.signOutBtn}`} onClick={signOut}>
        Sign Out
      </button>
    </div>
  )
}

// ── Profile Edit Modal ────────────────────────────────────────────────────────
function ProfileEditModal({ profile, user, onClose, onSaved }) {
  const toast = useToast()
  const { theme, setTheme, themes } = useTheme()
  const { signOut } = useApp()
  const [name, setName]     = useState(profile?.name ?? '')
  const [prefs, setPrefs]   = useState(profile?.preferences ?? [])
  const [newPass, setPass]  = useState('')
  const [confirm, setConf]  = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab]       = useState('edit')
  const [confirmDel, setDel]= useState(false)
  const [deleting, setDeling] = useState(false)

  function togglePref(p) { setPrefs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]) }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateProfile({ name, preferences: prefs })
      toast.success('Profile updated!')
      onSaved(updated)
      onClose()
    } catch { toast.error('Could not save.') }
    finally { setSaving(false) }
  }

  async function handlePassword() {
    if (!newPass || newPass !== confirm) return toast.error("Passwords don't match.")
    if (newPass.length < 6) return toast.error('Min 6 characters.')
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error
      toast.success('Password changed!')
      setPass(''); setConf('')
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeling(true)
    try { await deleteAccount(); await signOut() }
    catch { toast.error('Could not delete.'); setDeling(false) }
  }

  const TABS = [
    { key:'edit',     label: <><IconEditSm /> Profile</>  },
    { key:'security', label: <><IcoLock />   Security</> },
    { key:'account',  label: <><IconGear />  Account</>  },
  ]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className={styles.editModalTabs}>
          {TABS.map(t => (
            <button key={t.key}
              className={`${styles.editTab} ${tab === t.key ? styles.editTabActive : ''}`}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {tab === 'edit' && <>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:'1.2rem' }}>
              <div style={{
                width:80, height:80, borderRadius:'50%',
                background:'var(--hero-grad)',
                color:'white', fontSize:'1.8rem', fontWeight:800,
                display:'flex', alignItems:'center', justifyContent:'center',
                border:'3px solid rgba(255,255,255,0.3)',
                boxShadow:'0 4px 16px color-mix(in srgb, var(--primary) 30%, transparent)'
              }}>
                {getInitials(name, user?.email)}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:'1rem' }}>
              <label>Display name</label>
              <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:'1.2rem' }}>
              <label>Interests</label>
              <div className="pill-group" style={{ marginTop:'0.4rem' }}>
                {ALL_PREFS.map(p => (
                  <span key={p} className={`pill ${prefs.includes(p) ? 'active' : ''}`} onClick={() => togglePref(p)}>
                    {PREF_ICONS[p]} {p}
                  </span>
                ))}
              </div>
            </div>
            <button className={`${styles.btnAPrimary} ${styles.btnFull}`} onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" style={{width:16,height:16}} /> : 'Save changes'}
            </button>
          </>}

          {tab === 'security' && <>
            <div className="form-group" style={{ marginBottom:'0.9rem' }}>
              <label>New password</label>
              <input type="password" placeholder="••••••••" value={newPass} onChange={e => setPass(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:'1.2rem' }}>
              <label>Confirm password</label>
              <input type="password" placeholder="••••••••" value={confirm} onChange={e => setConf(e.target.value)} />
            </div>
            <button className={`${styles.btnAPrimary} ${styles.btnFull}`} onClick={handlePassword} disabled={saving}>
              {saving ? <span className="spinner" style={{width:16,height:16}} /> : 'Change Password'}
            </button>

          </>}

          {tab === 'account' && <>
            <div className={styles.dangerZone}>
              <div className={styles.dangerLabel}>⚠️ Danger Zone</div>
              <p className={styles.dangerDesc}>Permanently deletes your account and all data.</p>
              {confirmDel ? (
                <>
                  <button className={`${styles.btnADanger} ${styles.btnFull}`} onClick={handleDelete} disabled={deleting} style={{marginBottom:'0.5rem'}}>
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button className={`${styles.btnAGhost} ${styles.btnFull}`} onClick={() => setDel(false)}>Cancel</button>
                </>
              ) : (
                <button className={`${styles.btnADanger} ${styles.btnFull}`} onClick={() => setDel(true)}>
                  Delete my account
                </button>
              )}
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}

// ── Trips View with infinite scroll pagination ───────────────────────────────
const PAGE_SIZE = 9

// Sentinel component — fires a callback when it scrolls into view
function ScrollSentinel({ onVisible }) {
  const ref = React.useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onVisible() },
      { rootMargin: '200px' }   // trigger 200px before it's actually visible
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [onVisible])
  return <div ref={ref} style={{ height: 1 }} />
}

function TripsView({ trips, tripsLoaded }) {
  const [limits, setLimits] = useState({ Ongoing: PAGE_SIZE, Upcoming: PAGE_SIZE, Completed: PAGE_SIZE })

  // Reset limits when trips change (e.g. new trip added)
  useEffect(() => {
    setLimits({ Ongoing: PAGE_SIZE, Upcoming: PAGE_SIZE, Completed: PAGE_SIZE })
  }, [trips.length])

  if (!tripsLoaded) return (
    <div className={styles.loading}><div className="spinner" style={{ width:32, height:32 }} /></div>
  )
  if (trips.length === 0) return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>🌍</span>
      <p>No trips yet — use the sidebar to plan your first adventure!</p>
    </div>
  )

  return (
    <>
      <h1 className={styles.welcomeHeading} style={{ marginBottom:'1.5rem' }}>My Trips</h1>
      {[
        { status: 'Ongoing',   Icon: () => <IconCircle color="var(--orange)" />,   label: 'Ongoing'   },
        { status: 'Upcoming',  Icon: () => <IconCircle color="var(--primary)" />,  label: 'Upcoming'  },
        { status: 'Completed', Icon: () => <IconCheck />,                           label: 'Completed' },
      ].map(({ status, Icon, label }) => {
        const group = trips.filter(t => t.status === status)
        if (!group.length) return null
        const limit   = limits[status]
        const visible = group.slice(0, limit)
        const hasMore = group.length > limit
        return (
          <div key={status} className={styles.tripGroup}>
            <div className={styles.tripGroupHeader}>
              <span className={styles.tripStatusIcon}><Icon /></span>
              <h2 className={styles.tripGroupTitle}>{label}</h2>
              <span className={styles.tripGroupCount}>{group.length}</span>
            </div>
            <div className={styles.tripGrid}>
              {visible.map(trip => <TripCard key={trip.id} trip={trip} />)}
            </div>
            {/* Invisible sentinel — loads next page when scrolled into view */}
            {hasMore && (
              <ScrollSentinel
                onVisible={() =>
                  setLimits(prev => ({ ...prev, [status]: prev[status] + PAGE_SIZE }))
                }
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Wandr SVG Logo ────────────────────────────────────────────────────────────
function WandrLogo({ size = 'md', light = false }) {
  // size: 'sm' (sidebar ~26px text), 'md' (auth brand ~32px), 'xs' (header ~20px)
  const cfg = {
    xs: { iconW: 52, iconH: 26, text: 20 },
    sm: { iconW: 72, iconH: 36, text: 26 },
    md: { iconW: 88, iconH: 44, text: 32 },
  }
  const { iconW, iconH, text } = cfg[size] ?? cfg.md
  // Trail is always amber — it pops on both light and dark backgrounds
  // Wordmark follows the light prop
  const textColor = light ? 'white' : 'var(--nav-brand-color, #1C1917)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap: 10, lineHeight:1 }}>
      <svg width={iconW} height={iconH} viewBox="0 0 100 50" fill="none"
        xmlns="http://www.w3.org/2000/svg" style={{ flexShrink:0 }}>
        <path d="M4,26 C5,36 12,44 24,46"   stroke="#EF9F27" strokeWidth="3" strokeLinecap="round" strokeDasharray="2.5,8" />
        <path d="M24,46 C30,47 40,16 50,14"  stroke="#EF9F27" strokeWidth="3" strokeLinecap="round" strokeDasharray="2.5,8" />
        <path d="M50,14 C58,12 68,44 74,42"  stroke="#EF9F27" strokeWidth="3" strokeLinecap="round" strokeDasharray="2.5,8" />
        <path d="M74,42 C82,40 92,26 96,22"  stroke="#EF9F27" strokeWidth="3" strokeLinecap="round" strokeDasharray="2.5,8" />
        <circle cx="4"  cy="26" r="4.5" fill="#EF9F27" />
        <circle cx="24" cy="46" r="5"   fill="#EF9F27" />
        <circle cx="50" cy="14" r="4.8" fill="#EF9F27" />
        <circle cx="74" cy="42" r="4.2" fill="#EF9F27" />
        <circle cx="96" cy="22" r="3.8" fill="#EF9F27" />
      </svg>
      <span style={{
        fontFamily: "'Outfit', var(--font-display), sans-serif",
        fontWeight: 700,
        fontSize: text,
        letterSpacing: '-0.05em',
        color: textColor,
        lineHeight: 1,
      }}>wandr</span>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key:'dashboard', Icon: IconHome,     label:'Dashboard' },
  { key:'trips',     Icon: IconSuitcase, label:'My Trips'  },
  { key:'settings',  Icon: IconGear,     label:'Settings'  },
]

export default function Dashboard() {
  const { trips, locations, tripsLoaded, addTrip, user, signOut } = useApp()
  const toast = useToast()
  const { theme, setTheme, themes } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [view, setView] = useState(location.state?.view ?? 'dashboard')
  const [showCreator, setCreator] = useState(false)
  const [showEdit, setShowEdit]   = useState(false)
  const [prefillCity, setPrefillCity] = useState(null)
  const [prefillSpot, setPrefillSpot] = useState(null)  // { name, city, category }
  const [profile, setProfile]     = useState(null)
  const [profileLoading, setPLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    import('../api/client').then(({ getProfile }) => {
      getProfile().then(p => { setProfile(p); setPLoading(false) }).catch(() => setPLoading(false))
    })
  }, [user])

  function handleCreated(newTrip) {
    addTrip(newTrip)
    setCreator(false)
    toast.success(`"${newTrip.title}" saved! ✈️`)
  }

  function handleEventClick(tripId) {
    navigate(`/trip/${tripId}`)
  }

  const initials = getInitials(profile?.name, user?.email)
  const upcomingCount = trips.filter(t => t.status === 'Upcoming').length

  return (
    <div className={styles.shell}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <WandrLogo size="sm" />
        </div>

        <nav className={styles.sideNav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              className={`${styles.navItem} ${view === item.key ? styles.navItemActive : ''}`}
              onClick={() => setView(item.key)}
            >
              <span className={styles.navIcon}><item.Icon /></span>
              <span className={styles.navLabel}>{item.label}</span>
              {item.key === 'trips' && upcomingCount > 0 && (
                <span className={styles.navBadge}>{upcomingCount}</span>
              )}
            </button>
          ))}
        </nav>

        <button
          className={`${styles.sideNewTrip}`}
          onClick={() => setCreator(true)}
        >
          <span>＋</span>
          <span className={styles.navLabel}>New Trip</span>
        </button>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className={styles.main}>

      {/* ── TOP BAR (visible 601–1100px, replaces right panel) ── */}
      <div className={styles.topBar}>
        <div className={styles.topBarInner}>
          <div className={styles.topBarLeft}>
            <div className={styles.topBarAvatar} onClick={() => setShowEdit(true)}>
              {initials}
            </div>
            <div className={styles.topBarProfile}>
              <div className={styles.topBarName}>
                {profile?.name?.trim() || user?.email?.split('@')[0]}
              </div>
              <div className={styles.topBarStats}>
                <span className={styles.topBarStatPill}>{trips.length} trips</span>
                <span className={styles.topBarStatPill} style={{background:'color-mix(in srgb, var(--light) 35%, transparent)'}}>
                  {trips.filter(t=>t.status==='Upcoming').length} upcoming
                </span>
                <span className={styles.topBarStatPill} style={{background:'color-mix(in srgb, var(--yellow) 35%, transparent)'}}>
                  {trips.filter(t=>t.status==='Ongoing').length} ongoing
                </span>
                <span className={styles.topBarStatPill} style={{background:'rgba(255,255,255,0.15)'}}>
                  {trips.filter(t=>t.status==='Completed').length} completed
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard view */}
        {view === 'dashboard' && (
          <>
            {/* Welcome card */}
            {(() => {
            const firstName = profile?.name?.split(' ')[0] || user?.email?.split('@')[0]
            const ongoingTrip  = trips.find(t => t.status === 'Ongoing')
            const upcomingTrip = trips
              .filter(t => t.status === 'Upcoming' && t.start_date)
              .sort((a,b) => new Date(a.start_date) - new Date(b.start_date))[0]
            let subtext = 'Where will you go next? The world is waiting. 🌐'
            if (ongoingTrip) {
              subtext = `You're currently on a trip to ${ongoingTrip.city}!`
            } else if (upcomingTrip) {
              const daysUntil = Math.ceil((new Date(upcomingTrip.start_date + 'T00:00:00') - new Date()) / 86400000)
              subtext = `Your next adventure to ${upcomingTrip.city} is in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} ✈️`
            }
            return (
              <div className={styles.welcomeCard}>
                {/* Tablet-only two-column layout injected via style tag */}
                <style>{`
                  @media (min-width: 601px) and (max-width: 1100px) {
                    .tab-card-inner   { display: flex !important; align-items: flex-start; gap: 1.5rem; }
                    .tab-greeting     { flex: 1; min-width: 0; }
                    .tab-profile-col  { display: flex !important; flex-direction: column; gap: 10px; min-width: 210px; max-width: 240px; flex-shrink: 0; }
                  }
                  @media not ((min-width: 601px) and (max-width: 1100px)) {
                    .tab-profile-col  { display: none !important; }
                  }
                `}</style>

                <div className={`${styles.welcomeCardContent} tab-card-inner`}>

                  {/* ── Greeting (left on tablet) ── */}
                  <div className="tab-greeting">
                    <div className={styles.welcomeCardProfile}>
                      <div className={styles.welcomeCardAvatar}>{initials}</div>
                      <div>
                        <div className={styles.welcomeCardProfileName}>
                          {profile?.name?.trim() || user?.email?.split('@')[0]}
                        </div>
                        <div className={styles.welcomeCardProfileSub}>
                          {trips.length} trips · {trips.filter(t=>t.status==='Upcoming').length} upcoming
                        </div>
                        {profile?.preferences?.length > 0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:5 }}>
                            {profile.preferences.map(p => (
                              <span key={p} style={{
                                display:'inline-flex', alignItems:'center', gap:2,
                                fontSize:'0.6rem', fontWeight:600, padding:'1px 6px',
                                borderRadius:99, background:'rgba(255,255,255,0.18)',
                                color:'rgba(255,255,255,0.92)',
                                border:'0.5px solid rgba(255,255,255,0.28)',
                              }}>{PREF_ICONS[p]} {p}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <h1 className={styles.welcomeCardHeading}>Hello, {firstName}! </h1>
                    <p className={styles.welcomeCardSub}>{subtext}</p>
                  </div>

                  {/* ── Profile panel (right col, tablet only) ── */}
                  {(() => {
                    const tTotal     = trips.length
                    const tCompleted = trips.filter(t => t.status === 'Completed').length
                    const tUpcoming  = trips.filter(t => t.status === 'Upcoming').length
                    const tExplorer  = (() => {
                      let tier = EXPLORER_TIERS[0]
                      for (const t of EXPLORER_TIERS) { if (tTotal >= t.from) tier = t }
                      const maxed = tier.to === Infinity
                      const pct   = maxed ? 100 : Math.round(((tTotal - tier.from) / (tier.to - tier.from)) * 100)
                      return { name: tier.name, next: tier.next, pct, label: maxed ? 'Max level!' : `${tTotal} / ${tier.to} trips`, maxed }
                    })()
                    const tNextTrip  = (() => {
                      const today = new Date(); today.setHours(0,0,0,0)
                      const ongoing = trips.find(t => {
                        if (!t.start_date || t.status === 'Completed') return false
                        const s = new Date(t.start_date + 'T00:00:00')
                        const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : new Date(s)
                        return s <= today && today <= e
                      })
                      if (ongoing) {
                        const s = new Date(ongoing.start_date + 'T00:00:00')
                        const e = ongoing.end_date ? new Date(ongoing.end_date + 'T00:00:00') : new Date(s)
                        return { trip: ongoing, type: 'ongoing', dayNum: Math.round((today - s) / 86_400_000) + 1, totalDays: Math.round((e - s) / 86_400_000) + 1 }
                      }
                      const next = trips.filter(t => t.start_date && t.status === 'Upcoming').sort((a,b) => new Date(a.start_date)-new Date(b.start_date))[0]
                      if (!next) return null
                      const s = new Date(next.start_date + 'T00:00:00')
                      return { trip: next, type: 'upcoming', daysUntil: Math.round((s - today) / 86_400_000), spots: next.spots?.length ?? 0, dateStr: s.toLocaleDateString('en-US', { month:'short', day:'numeric' }) }
                    })()

                    // All colours are white-on-gradient — the welcome card uses the hero gradient bg
                    const w  = 'rgba(255,255,255,0.95)'
                    const wm = 'rgba(255,255,255,0.7)'
                    const wd = 'rgba(255,255,255,0.45)'
                    const wb = 'rgba(255,255,255,0.12)'
                    const ws = '0.5px solid rgba(255,255,255,0.18)'

                    return (
                      <div className="tab-profile-col">

                        {/* Explorer badge + progress */}
                        <div style={{ paddingBottom: 10, borderBottom: ws }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: w, marginBottom: 6 }}>
                            ✈️ {tExplorer.name}
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:wm, marginBottom:4 }}>
                            <span>Explorer progress</span>
                            <span>{tExplorer.label}</span>
                          </div>
                          <div style={{ height:4, borderRadius:99, background:'rgba(255,255,255,0.2)', overflow:'hidden' }}>
                            <div style={{ height:'100%', borderRadius:99, background:'rgba(255,255,255,0.85)', width:`${tExplorer.pct}%`, transition:'width 0.6s ease' }} />
                          </div>
                          {!tExplorer.maxed && (
                            <div style={{ textAlign:'right', fontSize:10, color:wd, marginTop:3 }}>→ {tExplorer.next}</div>
                          )}
                        </div>

                        {/* Stat rows */}
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          {[
                            { Icon: IconMap,   label: 'Total trips', val: tTotal    },
                            { Icon: IconCheck, label: 'Completed',   val: tCompleted },
                            { Icon: IconCal,   label: 'Upcoming',    val: tUpcoming  },
                          ].map(({ Icon, label, val }) => (
                            <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.15)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <Icon />
                              </div>
                              <span style={{ fontSize:12, color:wm, flex:1 }}>{label}</span>
                              <span style={{ fontSize:13, fontWeight:600, color:w }}>{val}</span>
                            </div>
                          ))}
                        </div>

                        {/* Next trip countdown */}
                        {tNextTrip && (
                          <div style={{ background: wb, border: ws, borderRadius: 8, padding: '8px 10px' }}>
                            {tNextTrip.type === 'ongoing' ? (
                              <>
                                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                                  <span style={{ width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,0.9)', boxShadow:'0 0 0 3px rgba(255,255,255,0.25)', display:'inline-block' }} />
                                  <span style={{ fontSize:10, fontWeight:600, color:w }}>Live now · {tNextTrip.trip.city}</span>
                                </div>
                                <div style={{ fontSize:10, color:wm, marginBottom:5 }}>Day {tNextTrip.dayNum} of {tNextTrip.totalDays}</div>
                                <div style={{ height:3, borderRadius:99, background:'rgba(255,255,255,0.2)', overflow:'hidden' }}>
                                  <div style={{ height:'100%', background:'rgba(255,255,255,0.85)', borderRadius:99, width:`${Math.round((tNextTrip.dayNum/tNextTrip.totalDays)*100)}%` }} />
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize:11, fontWeight:600, color:w, marginBottom:1 }}>{tNextTrip.trip.city}</div>
                                <div style={{ fontSize:10, color:wm, marginBottom:6 }}>✈ {tNextTrip.dateStr}</div>
                                <div style={{ display:'flex', gap:4 }}>
                                  {[
                                    { val: tNextTrip.daysUntil === 0 ? '🎉' : tNextTrip.daysUntil, label: tNextTrip.daysUntil === 0 ? 'today!' : 'days' },
                                    { val: tNextTrip.trip.days ?? '—', label: 'day trip' },
                                    { val: tNextTrip.spots, label: 'spots' },
                                  ].map(({ val, label }) => (
                                    <div key={label} style={{ flex:1, textAlign:'center', background:'rgba(255,255,255,0.12)', borderRadius:6, padding:'4px 2px' }}>
                                      <div style={{ fontSize:14, fontWeight:700, color:w, lineHeight:1 }}>{val}</div>
                                      <div style={{ fontSize:9, color:wm, marginTop:2 }}>{label}</div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                      </div>
                    )
                  })()}

                </div>
              </div>
            )
          })()}

            {/* Calendar + Events row */}
            <div className={styles.calendarRow}>
              <div className={styles.calendarCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}><IconCalLg /></span>
                  <h3 className={styles.cardTitle}>Calendar</h3>
                </div>
                <MiniCalendar trips={trips} />
              </div>
              <div className={styles.eventsCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}><IconList /></span>
                  <h3 className={styles.cardTitle}>Upcoming Trips</h3>
                </div>
                <UpcomingEvents trips={trips} onTripClick={handleEventClick} />
              </div>
            </div>

            {/* Recommended places */}
            {locations.length > 0 && (
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}><IconStar /></span>
                  <h3 className={styles.cardTitle}>Recommended for You</h3>
                  <span className={styles.cardSub}>Spots you haven't visited yet</span>
                </div>
                <RecommendedPlaces
                  locations={locations}
                  trips={trips}
                  preferences={profile?.preferences ?? []}
                  onPlanSpot={loc => {
                    setPrefillCity(loc.city)
                    setPrefillSpot({ name: loc.name, city: loc.city, category: loc.category })
                    setCreator(true)
                  }}
                />
              </div>
            )}

            {/* Travel heatmap */}
            {trips.length > 0 && (
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}><IconGlobe /></span>
                  <h3 className={styles.cardTitle}>Your Travel Map</h3>
                  <span className={styles.cardSub}>Countries you've explored</span>
                </div>
                <TravelHeatmap trips={trips} locations={locations} />
              </div>
            )}
          </>
        )}

        {view === 'trips' && (
          <TripsView trips={trips} tripsLoaded={tripsLoaded} />
        )}

        {/* Settings view */}
        {view === 'settings' && (
          <>
            <h1 className={styles.welcomeHeading} style={{ marginBottom:'1.5rem' }}>Settings</h1>
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>🎨</span>
                <h3 className={styles.cardTitle}>App Theme</h3>
                <span className={styles.cardSub}>
                  {themes[theme]?.emoji} {themes[theme]?.label}
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 10,
                marginTop: '0.75rem',
              }}>
                {Object.values(themes).map(t => {
                  const isActive = theme === t.key
                  const [primary, bg, accent] = t.preview
                  const isDark = parseInt(bg.slice(1,3), 16) < 80
                  return (
                    <button
                      key={t.key}
                      title={t.label}
                      onClick={e => {
                        if (isActive) return
                        // Card bounce
                        e.currentTarget.animate([
                          { transform: 'scale(1)' },
                          { transform: 'scale(0.92)' },
                          { transform: 'scale(1.07)' },
                          { transform: 'scale(1)' },
                        ], { duration: 300, easing: 'cubic-bezier(0.34,1.56,0.64,1)' })
                        // Smooth crossfade via View Transitions API, CSS fallback for older browsers
                        if (document.startViewTransition) {
                          document.startViewTransition(() => setTheme(t.key))
                        } else {
                          const root = document.documentElement
                          root.style.transition = 'background-color 0.4s ease, color 0.4s ease'
                          setTheme(t.key)
                          setTimeout(() => { root.style.transition = '' }, 450)
                        }
                      }}
                      style={{
                        position: 'relative',
                        height: 90,
                        borderRadius: 14,
                        border: isActive
                          ? `2px solid ${primary}`
                          : '2px solid var(--border)',
                        outline: isActive ? `3px solid ${primary}40` : 'none',
                        outlineOffset: 2,
                        overflow: 'hidden',
                        cursor: isActive ? 'default' : 'pointer',
                        background: bg,
                        padding: 0,
                        transition: 'transform 0.15s ease, border 0.2s ease, outline 0.2s ease',
                        transform: isActive ? 'scale(1.04)' : 'scale(1)',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.transform = 'scale(1.03)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      {/* SVG landscape scene */}
                      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                        preserveAspectRatio="none">
                        {/* Sky */}
                        <rect width="120" height="90" fill={bg} />
                        {/* Sun / moon glow */}
                        <circle cx="60" cy="42" r="14" fill={primary} opacity="0.7" />
                        <circle cx="60" cy="42" r="20" fill={primary} opacity="0.15" />
                        {/* Far hills */}
                        <path d="M0 58 Q20 40 40 50 Q60 34 80 46 Q100 36 120 44 L120 90 L0 90 Z"
                          fill={accent} opacity="0.55" />
                        {/* Mid hills */}
                        <path d="M0 65 Q25 52 50 60 Q75 48 100 56 Q110 52 120 54 L120 90 L0 90 Z"
                          fill={primary} opacity="0.85" />
                        {/* Ground */}
                        <path d="M0 74 Q30 68 60 72 Q90 66 120 70 L120 90 L0 90 Z"
                          fill={isDark ? `${primary}99` : primary} opacity="1" />
                      </svg>

                      {/* Label bar */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        padding: '5px 7px',
                        background: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.72)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{ fontSize: 12, lineHeight: 1 }}>{t.emoji}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, flex: 1,
                          color: isDark ? accent : primary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          letterSpacing: '0.01em',
                        }}>{t.label}</span>
                        {isActive && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <circle cx="6" cy="6" r="6" fill={primary} />
                            <path d="M3.5 6l1.8 1.8 3-3.6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className={styles.sectionCard} style={{ marginTop:'1rem' }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}><IconUser /></span>
                <h3 className={styles.cardTitle}>Account</h3>
              </div>
              <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.5rem', flexWrap:'wrap' }}>
                <button className={styles.btnAGhost} onClick={() => setShowEdit(true)}>
                  Edit Profile & Password
                </button>
                <button className={styles.btnAMuted} onClick={signOut}>
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* Profile view — mobile only */}
        {view === 'profile' && (() => {
          const mTotal     = trips.length
          const mCompleted = trips.filter(t => t.status === 'Completed').length
          const mUpcoming  = trips.filter(t => t.status === 'Upcoming').length
          const mExplorer  = (() => {
            let tier = EXPLORER_TIERS[0]
            for (const t of EXPLORER_TIERS) { if (mTotal >= t.from) tier = t }
            const maxed = tier.to === Infinity
            const pct   = maxed ? 100 : Math.round(((mTotal - tier.from) / (tier.to - tier.from)) * 100)
            return { name: tier.name, next: tier.next, pct, label: maxed ? 'Max level reached!' : `${mTotal} / ${tier.to} trips`, maxed }
          })()
          const mNextTrip  = (() => {
            const today = new Date(); today.setHours(0,0,0,0)
            const ongoing = trips.find(t => {
              if (!t.start_date || t.status === 'Completed') return false
              const s = new Date(t.start_date + 'T00:00:00')
              const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : new Date(s)
              return s <= today && today <= e
            })
            if (ongoing) {
              const s = new Date(ongoing.start_date + 'T00:00:00')
              const e = ongoing.end_date ? new Date(ongoing.end_date + 'T00:00:00') : new Date(s)
              return { trip: ongoing, type: 'ongoing', dayNum: Math.round((today - s) / 86_400_000) + 1, totalDays: Math.round((e - s) / 86_400_000) + 1 }
            }
            const next = trips.filter(t => t.start_date && t.status === 'Upcoming').sort((a,b) => new Date(a.start_date)-new Date(b.start_date))[0]
            if (!next) return null
            const s = new Date(next.start_date + 'T00:00:00')
            return { trip: next, type: 'upcoming', daysUntil: Math.round((s - today) / 86_400_000), spots: next.spots?.length ?? 0, dateStr: s.toLocaleDateString('en-US', { month:'short', day:'numeric' }) }
          })()
          const mTopCity = Object.entries(trips.reduce((acc,t) => ({ ...acc, [t.city]:(acc[t.city]||0)+1 }), {})).sort((a,b)=>b[1]-a[1])[0]

          return (
            <>
              <h1 className={styles.welcomeHeading} style={{ marginBottom:'1.2rem' }}>My Profile</h1>

              {/* Avatar + name + progress */}
              <div className={styles.profileCard} style={{ marginBottom:'1rem' }}>
                <div className={styles.profileAvatarWrap}>
                  <div className={styles.profileAvatar}>{initials}</div>
                </div>
                <div className={styles.profileName}>
                  {profile?.name?.trim() || <span className={styles.noName}>No name set</span>}
                </div>
                <div className={styles.profileEmail}>{user?.email}</div>
                <div className={styles.profileBadge}>✈️ {mExplorer.name}</div>
                <div style={{ marginTop:12, width:'100%' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.95)' }}>{mExplorer.name}</span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>{mExplorer.label}</span>
                  </div>
                  <div style={{ height:5, borderRadius:99, background:'rgba(255,255,255,0.2)', overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:99, background:'rgba(255,255,255,0.85)', width:`${mExplorer.pct}%`, transition:'width 0.6s ease' }} />
                  </div>
                  {!mExplorer.maxed && (
                    <div style={{ textAlign:'right', fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:3 }}>→ {mExplorer.next}</div>
                  )}
                </div>
              </div>

              {/* Stat rows */}
              <div className={styles.sectionCard} style={{ marginBottom:'1rem' }}>
                <div className={styles.panelLabel} style={{ marginBottom:8 }}>Trip Stats</div>
                {STAT_ROWS.map(({ Icon, bg, color, label }, i) => {
                  const val = [mTotal, mCompleted, mUpcoming][i]
                  return (
                    <div key={label} style={{ display:'flex', alignItems:'center', gap:9, padding:'3px 0' }}>
                      <div style={{ width:27, height:27, borderRadius:7, flexShrink:0, background:bg, color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Icon />
                      </div>
                      <span style={{ fontSize:13, color:'var(--color-text-secondary)', flex:1 }}>{label}</span>
                      <span style={{ fontSize:14, fontWeight:500, color:'var(--color-text-primary)' }}>{val}</span>
                    </div>
                  )
                })}
                {mTopCity && (
                  <div className={styles.topCity}>📍 Most visited: <strong>{mTopCity[0]}</strong> ({mTopCity[1]}x)</div>
                )}
              </div>

              {/* Next trip countdown */}
              {mNextTrip && (
                <div className={styles.sectionCard} style={{ marginBottom:'1rem' }}>
                  <div className={styles.panelLabel} style={{ marginBottom:8 }}>
                    {mNextTrip.type === 'ongoing' ? 'Currently travelling' : 'Next trip'}
                  </div>
                  {mNextTrip.type === 'ongoing' ? (
                    <div style={{ background:'color-mix(in srgb, var(--primary) 12%, var(--bg-card))', border:'0.5px solid color-mix(in srgb, var(--primary) 35%, transparent)', borderRadius:10, padding:'9px 11px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                        <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:'var(--primary)', boxShadow:'0 0 0 3px color-mix(in srgb, var(--primary) 35%, transparent)' }} />
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--primary)' }}>Live now</span>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:1 }}>{mNextTrip.trip.city}</div>
                      <div style={{ fontSize:11, color:'var(--text-soft)', marginBottom:8 }}>"{mNextTrip.trip.title}"</div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text-soft)', marginBottom:4 }}>
                        <span>Day {mNextTrip.dayNum} of {mNextTrip.totalDays}</span>
                        <span>{Math.round((mNextTrip.dayNum / mNextTrip.totalDays) * 100)}% complete</span>
                      </div>
                      <div style={{ height:4, borderRadius:99, background:'color-mix(in srgb, var(--primary) 20%, var(--bg-subtle))', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:99, background:'var(--primary)', width:`${Math.round((mNextTrip.dayNum / mNextTrip.totalDays) * 100)}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background:'var(--color-background-secondary)', borderRadius:10, padding:'9px 11px' }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'var(--color-text-primary)', marginBottom:1 }}>{mNextTrip.trip.city}</div>
                      <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginBottom:8 }}>✈ {mNextTrip.trip.title} · {mNextTrip.dateStr}</div>
                      <div style={{ display:'flex', gap:5 }}>
                        {[
                          { val: mNextTrip.daysUntil === 0 ? '🎉' : mNextTrip.daysUntil, label: mNextTrip.daysUntil === 0 ? 'today!' : 'days away' },
                          { val: mNextTrip.trip.days ?? '—', label: 'day trip' },
                          { val: mNextTrip.spots, label: 'spots' },
                        ].map(({ val, label }) => (
                          <div key={label} style={{ flex:1, textAlign:'center', background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-tertiary)', borderRadius:7, padding:'5px 3px' }}>
                            <div style={{ fontSize:17, fontWeight:500, color:'var(--color-text-primary)', lineHeight:1 }}>{val}</div>
                            <div style={{ fontSize:10, color:'var(--color-text-tertiary)', marginTop:2 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Interests */}
              {profile?.preferences?.length > 0 && (
                <div className={styles.sectionCard} style={{ marginBottom:'1rem' }}>
                  <div className={styles.panelLabel} style={{ marginBottom:8 }}>Your Interests</div>
                  <div className="pill-group">
                    {profile.preferences.map(p => (
                      <span key={p} className="pill active">{PREF_ICONS[p]} {p}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </main>

      {/* ── RIGHT PANEL (desktop only) ── */}
      <aside className={styles.rightPanel}>
        {!profileLoading && (
          <ProfilePanel
            profile={profile}
            user={user}
            trips={trips}
            onEditProfile={() => setShowEdit(true)}
          />
        )}
      </aside>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className={styles.bottomNav}>
        {NAV_ITEMS.map(item => (
          <button key={item.key}
            className={`${styles.bottomNavItem} ${view === item.key ? styles.bottomNavActive : ''}`}
            onClick={() => setView(item.key)}>
            <span className={styles.bottomNavIcon}><item.Icon /></span>
            <span className={styles.bottomNavLabel}>{item.label}</span>
          </button>
        ))}
        <button
          className={`${styles.bottomNavItem} ${view === 'profile' ? styles.bottomNavActive : ''}`}
          onClick={() => setView('profile')}>
          <span className={styles.bottomNavAvatar}>{initials}</span>
          <span className={styles.bottomNavLabel}>Profile</span>
        </button>
      </nav>

      {/* ── MOBILE FAB — New Trip ── */}
      <button className={styles.mobileFab} onClick={() => setCreator(true)}>
        ＋ New Trip
      </button>

      {/* ── MODALS ── */}
      {showCreator && (
        <TripCreatorModal
          locations={locations}
          existingTrips={trips}
          prefillCity={prefillCity}
          prefillSpot={prefillSpot}
          onClose={() => { setCreator(false); setPrefillCity(null); setPrefillSpot(null) }}
          onCreated={handleCreated}
        />
      )}

      {showEdit && (
        <ProfileEditModal
          profile={profile ?? { name: '', preferences: [] }}
          user={user}
          onClose={() => setShowEdit(false)}
          onSaved={p => setProfile(p)}
        />
      )}
    </div>
  )
}
