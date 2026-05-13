import { useState, useEffect } from 'react'
import { generateTrip } from '../api/client'
import { useToast } from '../context/ToastContext'
import styles from './TripCreatorModal.module.css'

const ALL_CATEGORIES = ['Sightseeing', 'Culture', 'Nature', 'History', 'Art', 'Food']

function todayPlus(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function TripCreatorModal({ locations, existingTrips, onClose, onCreated, prefillCity, prefillSpot }) {
  const toast = useToast()
  const cities = [...new Set(locations.map(l => l.city))].sort()

  const [city, setCity]             = useState(prefillCity ?? cities[0] ?? '')
  const [title, setTitle]           = useState('')
  const [days, setDays]             = useState(3)
  const [startDate, setStartDate]   = useState(todayPlus(7))
  const [hotel, setHotel]           = useState('')
  const [prefs, setPrefs]           = useState([])
  const [maxBudget, setMaxBudget]   = useState(0)
  const [allowRain, setAllowRain]   = useState(false)
  const [restDay1, setRestDay1]     = useState(true)
  const [excludeVisited, setExclude]= useState(false)
  const [loading, setLoading]       = useState(false)
  const [budgetWarning, setWarning] = useState('')

  // Cooldown persisted in localStorage so it survives modal close/reopen
  const [cooldown, setCooldown] = useState(() => {
    const until = parseInt(localStorage.getItem('wandr_gen_cooldown') ?? '0', 10)
    return Math.max(0, Math.ceil((until - Date.now()) / 1000))
  })

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const hotels = locations.filter(l => l.city === city && l.category === 'Hotel')
  const endDate = new Date(new Date(startDate).getTime() + (days - 1) * 86400000)
    .toISOString().split('T')[0]

  const prevTrips    = existingTrips.filter(t => t.city === city)
  const visitedNames = new Set(prevTrips.flatMap(t => t.spots?.map(s => s.name) ?? []))
  const visitedCount = visitedNames.size

  useEffect(() => {
    setHotel(hotels[0]?.name ?? '')
    setWarning('')
  }, [city])

  function togglePref(cat) {
    setPrefs(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat])
  }

  async function handleGenerate() {
    setWarning('')
    setLoading(true)
    try {
      const result = await generateTrip({
        title: title.trim() || `Trip to ${city}`,
        city, days: Number(days),
        start_date: startDate || null,
        chosen_hotel: hotel || null,
        user_preferences: prefs,
        max_budget: Number(maxBudget),
        allow_outdoor_rain: allowRain,
        rest_on_arrival: restDay1,
        exclude_visited: excludeVisited,
        pinned_spot: prefillSpot?.city === city ? prefillSpot.name : null,
      })
      if (result.over_budget) {
        setWarning(
          `Heads up — estimated cost is ${Number(result.cost).toFixed(0)}, ` +
          `which is ${Number(result.over_by).toFixed(0)} over your ${maxBudget} budget.`
        )
      }
      onCreated(result)
      localStorage.setItem('wandr_gen_cooldown', String(Date.now() + 30000))
      setCooldown(30)
    } catch (err) {
      toast.error(err.message || 'Failed to generate trip. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const selectedHotel = hotels.find(h => h.name === hotel)
  const hotelNightly  = selectedHotel?.cost ?? 0
  const estHotelTotal = hotelNightly * days

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2>✈️ Plan a New Adventure</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* ── Section 1: Your Trip ── */}
          <div className={styles.sectionDivider}>
            <span className={styles.sectionLabel}>Your Trip</span>
          </div>

          <div className="form-group" style={{ marginBottom:'1rem' }}>
            <label>Trip name</label>
            <input placeholder={`e.g. First time in ${city}!`} value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="form-row cols-2" style={{ marginBottom:'1rem' }}>
            <div className="form-group">
              <label>Destination</label>
              <select value={city} onChange={e => setCity(e.target.value)}>
                {cities.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Start date</label>
              <input type="date" value={startDate} min={todayPlus(0)} onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>

          <div className="form-row cols-2" style={{ marginBottom:'0.5rem' }}>
            <div className="form-group">
              <label>How many days?</label>
              <input type="number" min={1} max={30} value={days}
                onChange={e => setDays(Math.max(1, Math.min(30, Number(e.target.value))))} />
            </div>
            <div className="form-group">
              <label>Ends</label>
              <div className={styles.endDateDisplay}>
                {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
              </div>
            </div>
          </div>

          {/* ── Section 2: Your Stay ── */}
          {hotels.length > 0 && (
            <>
              <div className={styles.sectionDivider}>
                <span className={styles.sectionLabel}>Your Stay</span>
              </div>
              <div className="form-group" style={{ marginBottom:'0.5rem' }}>
                <label>Hotel</label>
                <div className={styles.hotelSelectWrap}>
                  <select value={hotel} onChange={e => setHotel(e.target.value)}>
                    {hotels.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
                  </select>
                  {hotelNightly > 0 && (
                    <span className={styles.hotelNightlyBadge}>${hotelNightly}/night</span>
                  )}
                </div>
                {estHotelTotal > 0 && (
                  <div className={styles.hotelEst}>
                    Hotel subtotal: <strong>${estHotelTotal.toLocaleString()}</strong> for {days} night{days>1?'s':''}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Section 3: Preferences ── */}
          <div className={styles.sectionDivider}>
            <span className={styles.sectionLabel}>Preferences</span>
          </div>

          <div className={styles.prefsRow}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Interests <span style={{ fontWeight:400, textTransform:'none', color:'#aaa', letterSpacing:0 }}>(leave blank for all)</span></label>
              <div className="pill-group" style={{ marginTop:'0.4rem' }}>
                {ALL_CATEGORIES.map(cat => (
                  <span key={cat} className={`pill ${prefs.includes(cat) ? 'active' : ''}`} onClick={() => togglePref(cat)}>{cat}</span>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Max budget (USD)</label>
              <input type="number" min={0} step={50} value={maxBudget}
                onChange={e => setMaxBudget(Math.max(0, Number(e.target.value)))}
                placeholder="0 = no limit" />
            </div>
          </div>

          {/* ── Section 4: Options ── */}
          <div className={styles.sectionDivider}>
            <span className={styles.sectionLabel}>Options</span>
          </div>

          <div className={styles.toggleCards}>
            <label className={`${styles.toggleCard} ${allowRain ? styles.toggleCardActive : ''}`}>
              <input type="checkbox" checked={allowRain} onChange={e => setAllowRain(e.target.checked)} />
              <div className={styles.toggleCardText}>
                <span className={styles.toggleCardTitle}>🌧️ Outdoor in rain</span>
                <span className={styles.toggleCardDesc}>Include outdoor spots even if it might rain</span>
              </div>
            </label>
            <label className={`${styles.toggleCard} ${restDay1 ? styles.toggleCardActive : ''}`}>
              <input type="checkbox" checked={restDay1} onChange={e => setRestDay1(e.target.checked)} />
              <div className={styles.toggleCardText}>
                <span className={styles.toggleCardTitle}>😴 Rest on arrival</span>
                <span className={styles.toggleCardDesc}>Keep Day 1 morning free to settle in</span>
              </div>
            </label>
          </div>

          {/* ── Pinned spot banner ── */}
          {prefillSpot && prefillSpot.city === city && (
            <div className="info-banner green" style={{ marginTop:'1rem' }}>
              📍 <strong>{prefillSpot.name}</strong> will be included in your itinerary
              <span style={{ fontSize:'0.78rem', color:'var(--muted)', display:'block', marginTop:'2px' }}>
                This spot from your recommendation will be guaranteed on Day 1.
              </span>
            </div>
          )}

          {/* ── Returning visitor banner ── */}
          {prevTrips.length > 0 && (
            <div className="info-banner green" style={{ marginTop:'1rem' }}>
              <strong>You've been to {city} before!</strong>
              <div style={{ fontSize:'0.82rem', marginTop:'2px' }}>
                {visitedCount} spots visited across {prevTrips.length} trip{prevTrips.length>1?'s':''}.
              </div>
              <label className={styles.toggle} style={{ marginTop:'0.6rem' }}>
                <input type="checkbox" checked={excludeVisited} onChange={e => setExclude(e.target.checked)} />
                <span>Find new spots I haven't visited yet</span>
              </label>
            </div>
          )}

          {budgetWarning && <div className="info-banner yellow" style={{ marginTop:'0.75rem' }}>{budgetWarning}</div>}

          <button
            className={`btn btn-primary btn-full ${styles.generateBtn}`}
            onClick={handleGenerate}
            disabled={loading || cooldown > 0}
          >
            {loading
              ? <><span className="spinner" style={{ width:18, height:18 }} /> Generating your plan…</>
              : cooldown > 0
                ? `Please wait ${cooldown}s…`
                : '✈️  Generate My Plan'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
