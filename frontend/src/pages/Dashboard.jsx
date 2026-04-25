import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON, Tooltip } from 'react-leaflet'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { useTheme, THEMES } from '../context/ThemeContext'
import { getProfile, updateProfile, deleteAccount } from '../api/client'
import { supabase } from '../supabase'
import TripCard from '../components/TripCard'
import TripCreatorModal from '../components/TripCreatorModal'
import styles from './Dashboard.module.css'

const ALL_PREFS = ['Sightseeing', 'Culture', 'Nature', 'History', 'Art', 'Food']
const PREF_ICONS = {
  Sightseeing:'🗼', Culture:'🎭', Nature:'🌿', History:'🏛️', Art:'🎨', Food:'🍜',
}
const CAT_ICONS = { Hotel:'🏨', Food:'🍜', Sightseeing:'🗼', Culture:'🎭', Nature:'🌿', History:'🏛️', Art:'🎨' }

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
  const now   = new Date()
  const year  = new Date(now.getFullYear(), now.getMonth() + offset, 1).getFullYear()
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1).getMonth()
  const firstDay  = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' })

  // Build set of highlighted days
  const highlighted = useMemo(() => {
    const days = new Set()
    trips.forEach(t => {
      if (!t.start_date) return
      const start = new Date(t.start_date + 'T00:00:00')
      const end   = t.end_date ? new Date(t.end_date + 'T00:00:00') : start
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === year && d.getMonth() === month)
          days.add(d.getDate())
      }
    })
    return days
  }, [trips, year, month])

  const isToday = (d) =>
    d === now.getDate() && month === now.getMonth() && year === now.getFullYear()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className={styles.calendar}>
      <div className={styles.calHeader}>
        <button className={styles.calNav} onClick={() => setOffset(o => o - 1)}>‹</button>
        <span className={styles.calMonth}>{monthName}</span>
        <button className={styles.calNav} onClick={() => setOffset(o => o + 1)}>›</button>
      </div>
      <div className={styles.calGrid}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className={styles.calDow}>{d}</div>
        ))}
        {cells.map((d, i) => (
          <div key={i}
            className={`${styles.calCell}
              ${!d ? styles.calEmpty : ''}
              ${d && isToday(d) ? styles.calToday : ''}
              ${d && highlighted.has(d) ? styles.calHighlight : ''}
            `}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Upcoming Trip Events ──────────────────────────────────────────────────────
function UpcomingEvents({ trips }) {
  const upcoming = trips
    .filter(t => t.status === 'Upcoming' && t.start_date)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 4)

  if (!upcoming.length) return (
    <div className={styles.noEvents}>No upcoming trips planned yet.</div>
  )

  return (
    <div className={styles.eventList}>
      {upcoming.map(t => {
        const start = new Date(t.start_date + 'T00:00:00')
        const dayNum  = start.getDate()
        const month = start.toLocaleDateString('en-US', { month:'short' })
        return (
          <div key={t.id} className={styles.eventItem}>
            <div className={styles.eventDate}>
              <span className={styles.eventDay}>{dayNum}</span>
              <span className={styles.eventMonth}>{month}</span>
            </div>
            <div className={styles.eventInfo}>
              <div className={styles.eventCity}>{t.city}</div>
              <div className={styles.eventTitle}>"{t.title}"</div>
              <div className={styles.eventDays}>{t.days} day{t.days > 1 ? 's' : ''}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Recommended Places ────────────────────────────────────────────────────────
function RecommendedPlaces({ locations, trips }) {
  const visited = useMemo(() => {
    const s = new Set()
    trips.forEach(t => t.spots?.forEach(sp => s.add(sp.name)))
    return s
  }, [trips])

  // Pick unvisited spots across varied categories, excluding hotels
  const recs = useMemo(() => {
    const nonHotel = locations.filter(l => l.category !== 'Hotel' && !visited.has(l.name))
    // Shuffle deterministically by name hash, then take first 8
    return [...nonHotel]
      .sort((a, b) => {
        let ha = 0, hb = 0
        for (const c of a.name) ha = (ha * 31 + c.charCodeAt(0)) & 0xffff
        for (const c of b.name) hb = (hb * 31 + c.charCodeAt(0)) & 0xffff
        return ha - hb
      })
      .slice(0, 8)
  }, [locations, visited])

  if (!recs.length) return null

  return (
    <div className={styles.recGrid}>
      {recs.map((loc, i) => {
        const rating = getStarRating(loc.name)
        const icon   = CAT_ICONS[loc.category] ?? '📍'
        return (
          <div key={i} className={styles.recCard}>
            <div className={styles.recImgPlaceholder} style={{
              background: `linear-gradient(135deg, hsl(${(i*47+180)%360},50%,55%), hsl(${(i*47+220)%360},60%,40%))`
            }}>
              <span className={styles.recCatIcon}>{icon}</span>
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
            </div>
          </div>
        )
      })}
    </div>
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

  // Split MultiPolygon features into individual Polygon features so that
  // overseas territories (e.g. French Guiana) are colored independently.
  // Only polygons that actually contain a visited city get highlighted.
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
      fillColor: '#20878E', fillOpacity: intensity,
      color: '#0d5a60', weight: 1.5, opacity: 0.85,
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
          🌍 You've visited <strong>{visitedCount}</strong> countr{visitedCount > 1 ? 'ies' : 'y'}
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

// ── Profile Panel (right) ─────────────────────────────────────────────────────
function ProfilePanel({ profile, user, trips, onEditProfile }) {
  const { signOut } = useApp()
  const total     = trips.length
  const completed = trips.filter(t => t.status === 'Completed').length
  const upcoming  = trips.filter(t => t.status === 'Upcoming').length
  const initials  = getInitials(profile?.name, user?.email)
  const cityCounts = trips.reduce((acc, t) => ({ ...acc, [t.city]: (acc[t.city] ?? 0) + 1 }), {})
  const topCity   = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className={styles.rightPanel}>
      {/* Profile card */}
      <div className={styles.profileCard}>
        <div className={styles.profileAvatarWrap}>
          <div className={styles.profileAvatar}>{initials}</div>
          <button className={styles.editAvatarBtn} onClick={onEditProfile} title="Edit profile">✏️</button>
        </div>
        <div className={styles.profileName}>{profile?.name?.trim() || <span className={styles.noName}>Add your name</span>}</div>
        <div className={styles.profileEmail}>{user?.email}</div>
        <div className={styles.profileBadge}>✈️ Traveller</div>
      </div>

      {/* Stats */}
      <div className={styles.panelSection}>
        <div className={styles.panelLabel}>Travel Stats</div>
        <div className={styles.statsRow}>
          <div className={styles.statChip} style={{ borderColor:'var(--primary)' }}>
            <span className={styles.statN} style={{ color:'var(--primary)' }}>{total}</span>
            <span className={styles.statL}>Trips</span>
          </div>
          <div className={styles.statChip} style={{ borderColor:'var(--orange)' }}>
            <span className={styles.statN} style={{ color:'var(--orange)' }}>{completed}</span>
            <span className={styles.statL}>Done</span>
          </div>
          <div className={styles.statChip} style={{ borderColor:'var(--light)' }}>
            <span className={styles.statN} style={{ color:'var(--light)' }}>{upcoming}</span>
            <span className={styles.statL}>Soon</span>
          </div>
        </div>
        {topCity && (
          <div className={styles.topCity}>
            📍 Favourite: <strong>{topCity[0]}</strong>
          </div>
        )}
      </div>

      {/* Preferences */}
      {profile?.preferences?.length > 0 && (
        <div className={styles.panelSection}>
          <div className={styles.panelLabel}>Your Interests</div>
          <div className="pill-group">
            {profile.preferences.map(p => (
              <span key={p} className="pill active">{PREF_ICONS[p]} {p}</span>
            ))}
          </div>
        </div>
      )}

      <button className={`btn btn-ghost btn-full ${styles.signOutBtn}`} onClick={signOut}>
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
    { key:'edit',     label:'✏️ Profile' },
    { key:'security', label:'🔒 Security' },
    { key:'account',  label:'⚙️ Account' },
  ]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
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
            <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
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
            <button className="btn btn-primary btn-full" onClick={handlePassword} disabled={saving}>
              {saving ? <span className="spinner" style={{width:16,height:16}} /> : 'Change Password'}
            </button>
            <div className={styles.themeSection}>
              <div className={styles.panelLabel} style={{ marginBottom:'0.6rem' }}>🎨 App Theme</div>
              <div className={styles.themeGrid}>
                {Object.values(themes).map(t => (
                  <button key={t.key}
                    className={`${styles.themeCard} ${theme === t.key ? styles.themeCardActive : ''}`}
                    onClick={() => setTheme(t.key)}>
                    <div className={styles.themeSwatches}>
                      {t.preview.map((c, i) => <span key={i} className={styles.swatch} style={{ background:c }} />)}
                    </div>
                    <span className={styles.themeLabel}>{t.label}</span>
                    {theme === t.key && <span className={styles.themeCheck}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </>}

          {tab === 'account' && <>
            <div className={styles.dangerZone}>
              <div className={styles.dangerLabel}>⚠️ Danger Zone</div>
              <p className={styles.dangerDesc}>Permanently deletes your account and all data.</p>
              {confirmDel ? (
                <>
                  <button className={`btn btn-full ${styles.deleteBtn}`} onClick={handleDelete} disabled={deleting} style={{marginBottom:'0.5rem'}}>
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button className="btn btn-ghost btn-full" onClick={() => setDel(false)}>Cancel</button>
                </>
              ) : (
                <button className={`btn btn-full ${styles.deleteBtn}`} onClick={() => setDel(true)}>
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

// ── Trips View with pagination ────────────────────────────────────────────────
const PAGE_SIZE = 9

function TripsView({ trips, tripsLoaded }) {
  const [limits, setLimits] = useState({ Ongoing: PAGE_SIZE, Upcoming: PAGE_SIZE, Completed: PAGE_SIZE })

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
        { status: 'Ongoing',   icon: '🟡', label: 'Ongoing' },
        { status: 'Upcoming',  icon: '🔵', label: 'Upcoming' },
        { status: 'Completed', icon: '✅', label: 'Completed' },
      ].map(({ status, icon, label }) => {
        const group = trips.filter(t => t.status === status)
        if (!group.length) return null
        const limit   = limits[status]
        const visible = group.slice(0, limit)
        const hasMore = group.length > limit
        return (
          <div key={status} className={styles.tripGroup}>
            <div className={styles.tripGroupHeader}>
              <span>{icon}</span>
              <h2 className={styles.tripGroupTitle}>{label}</h2>
              <span className={styles.tripGroupCount}>{group.length}</span>
            </div>
            <div className={styles.tripGrid}>
              {visible.map(trip => <TripCard key={trip.id} trip={trip} />)}
            </div>
            {hasMore && (
              <button
                className={styles.loadMoreBtn}
                onClick={() => setLimits(prev => ({ ...prev, [status]: prev[status] + PAGE_SIZE }))}
              >
                Show more ({group.length - limit} remaining)
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key:'dashboard', icon:'🏠', label:'Dashboard' },
  { key:'trips',     icon:'🗺', label:'My Trips' },
  { key:'settings',  icon:'⚙️', label:'Settings' },
]

export default function Dashboard() {
  const { trips, locations, tripsLoaded, addTrip, user } = useApp()
  const toast = useToast()
  const { theme, setTheme, themes } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [view, setView] = useState(location.state?.view ?? 'dashboard')
  const [showCreator, setCreator] = useState(false)
  const [showEdit, setShowEdit]   = useState(false)
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

  const initials = getInitials(profile?.name, user?.email)
  const upcomingCount = trips.filter(t => t.status === 'Upcoming').length

  return (
    <div className={styles.shell}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span className={styles.logoPlane}>✈</span>
          <span className={styles.logoText}>Wandr</span>
        </div>

        <nav className={styles.sideNav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              className={`${styles.navItem} ${view === item.key ? styles.navItemActive : ''}`}
              onClick={() => setView(item.key)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
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
        <div className={styles.topBarLeft}>
          <div className={styles.topBarAvatar} onClick={() => setShowEdit(true)}>
            {initials}
          </div>
          <div className={styles.topBarProfile}>
            <div className={styles.topBarName}>
              {profile?.name?.trim() || user?.email?.split('@')[0]}
            </div>
            <div className={styles.topBarStats}>
              <span>{trips.length} trips</span>
              <span className={styles.topBarDot}>·</span>
              <span>{trips.filter(t=>t.status==='Upcoming').length} upcoming</span>
              <span className={styles.topBarDot}>·</span>
              <span>{trips.filter(t=>t.status==='Completed').length} completed</span>
            </div>
          </div>
        </div>
        <button className={styles.topBarEditBtn} onClick={() => setShowEdit(true)}>
          Edit Profile
        </button>
      </div>

      {/* Dashboard view */}
        {view === 'dashboard' && (
          <>
            {/* Welcome */}
            <div className={styles.welcomeRow}>
              <div>
                <h1 className={styles.welcomeHeading}>
                  Hello, {profile?.name?.split(' ')[0] || user?.email?.split('@')[0]}! 👋
                </h1>
                <p className={styles.welcomeSub}>Ready to plan your next adventure?</p>
              </div>
            </div>

            {/* Calendar + Events row */}
            <div className={styles.calendarRow}>
              <div className={styles.calendarCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>📅</span>
                  <h3 className={styles.cardTitle}>Calendar</h3>
                </div>
                <MiniCalendar trips={trips} />
              </div>
              <div className={styles.eventsCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>🗓</span>
                  <h3 className={styles.cardTitle}>Upcoming Trips</h3>
                </div>
                <UpcomingEvents trips={trips} />
              </div>
            </div>

            {/* Recommended places */}
            {locations.length > 0 && (
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>✨</span>
                  <h3 className={styles.cardTitle}>Recommended for You</h3>
                  <span className={styles.cardSub}>Spots you haven't visited yet</span>
                </div>
                <RecommendedPlaces locations={locations} trips={trips} />
              </div>
            )}

            {/* Travel heatmap */}
            {trips.length > 0 && (
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>🌍</span>
                  <h3 className={styles.cardTitle}>Your Travel Map</h3>
                  <span className={styles.cardSub}>Countries you've explored</span>
                </div>
                <TravelHeatmap trips={trips} locations={locations} />
              </div>
            )}
          </>
        )}

        {/* Trips view */}
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
              </div>
              <div className={styles.themeGrid} style={{ marginTop:'0.5rem' }}>
                {Object.values(themes).map(t => (
                  <button key={t.key}
                    className={`${styles.themeCard} ${theme === t.key ? styles.themeCardActive : ''}`}
                    onClick={() => setTheme(t.key)}>
                    <div className={styles.themeSwatches}>
                      {t.preview.map((c, i) => <span key={i} className={styles.swatch} style={{ background:c }} />)}
                    </div>
                    <span className={styles.themeLabel}>{t.label}</span>
                    {theme === t.key && <span className={styles.themeCheck}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.sectionCard} style={{ marginTop:'1rem' }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>👤</span>
                <h3 className={styles.cardTitle}>Account</h3>
              </div>
              <button className="btn btn-ghost" style={{ marginTop:'0.5rem' }} onClick={() => setShowEdit(true)}>
                Edit Profile & Password
              </button>
            </div>
          </>
        )}
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
            <span>{item.icon}</span>
            <span className={styles.bottomNavLabel}>{item.label}</span>
          </button>
        ))}
        <button className={`${styles.bottomNavItem}`} onClick={() => setShowEdit(true)}>
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
          onClose={() => setCreator(false)}
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
