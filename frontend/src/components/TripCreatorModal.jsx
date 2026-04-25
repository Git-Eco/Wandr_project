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

export default function TripCreatorModal({ locations, existingTrips, onClose, onCreated }) {
  const toast = useToast()
  const cities = [...new Set(locations.map(l => l.city))].sort()

  const [city, setCity]             = useState(cities[0] ?? '')
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
      })
      if (result.over_budget) {
        setWarning(
          `Heads up — estimated cost is $${Number(result.cost).toFixed(0)}, ` +
          `which is $${Number(result.over_by).toFixed(0)} over your $${maxBudget} budget.`
        )
      }
      onCreated(result)
      // Store cooldown expiry timestamp in localStorage
      localStorage.setItem('wandr_gen_cooldown', String(Date.now() + 30000))
      setCooldown(30)
    } catch (err) {
      toast.error(err.message || 'Failed to generate trip. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const hotelNightly  = hotels.find(h => h.name === hotel)?.cost ?? 0
  const estHotelTotal = hotelNightly * days

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>✈️ Plan a New Adventure</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
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

          <div className="form-row cols-2" style={{ marginBottom:'1rem' }}>
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

          {hotels.length > 0 && (
            <div className="form-group" style={{ marginBottom:'1rem' }}>
              <label>Hotel</label>
              <select value={hotel} onChange={e => setHotel(e.target.value)}>
                {hotels.map(h => <option key={h.name} value={h.name}>{h.name}  (${h.cost}/night)</option>)}
              </select>
              {estHotelTotal > 0 && (
                <div className={styles.hotelEst}>
                  Hotel subtotal: <strong>${estHotelTotal.toLocaleString()}</strong> for {days} night{days>1?'s':''}
                </div>
              )}
            </div>
          )}

          <div className="form-group" style={{ marginBottom:'1rem' }}>
            <label>Interests <span style={{ fontWeight:400, textTransform:'none', color:'#aaa', letterSpacing:0 }}>(leave blank for all)</span></label>
            <div className="pill-group">
              {ALL_CATEGORIES.map(cat => (
                <span key={cat} className={`pill ${prefs.includes(cat) ? 'active' : ''}`} onClick={() => togglePref(cat)}>{cat}</span>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom:'1rem' }}>
            <label>Max budget (USD) — 0 = no limit</label>
            <input type="number" min={0} step={50} value={maxBudget} onChange={e => setMaxBudget(Math.max(0, Number(e.target.value)))} />
          </div>

          <div className={styles.toggleRow}>
            <label className={styles.toggle}>
              <input type="checkbox" checked={allowRain} onChange={e => setAllowRain(e.target.checked)} />
              <span>Allow outdoor spots in rain</span>
            </label>
            <label className={styles.toggle}>
              <input type="checkbox" checked={restDay1} onChange={e => setRestDay1(e.target.checked)} />
              <span>Rest on Day 1 morning</span>
            </label>
          </div>

          {prevTrips.length > 0 && (
            <div className="info-banner green" style={{ marginTop:'0.8rem' }}>
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
