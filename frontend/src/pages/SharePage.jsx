import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSharedTrip } from '../api/client'
import { OverviewMap } from '../components/MapView'
import ScheduleCard from '../components/ScheduleCard'
import styles from './SharePage.module.css'

const SLOT_ORDER = ['Breakfast ☕','Morning 🌅','Lunch 🍔','Afternoon ☀️','Dinner 🍷','Evening 🌙']

const STATUS_COLORS = {
  Upcoming:'#92C4C6', Ongoing:'#F3C375', Completed:'#20878E',
}

function BudgetBox({ label, amount, gradient }) {
  return (
    <div className={styles.budgetBox} style={{ background: gradient }}>
      <div className={styles.budgetLabel}>{label}</div>
      <div className={styles.budgetAmount}>
        ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
    </div>
  )
}

export default function SharePage() {
  const { id } = useParams()
  const [trip, setTrip]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(false)
  const [expandedDays, setExpanded] = useState({ 1: true })

  useEffect(() => {
    getSharedTrip(id)
      .then(setTrip)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className={styles.center}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  if (error || !trip) return (
    <div className={styles.center}>
      <div className={styles.errorBox}>
        <div className={styles.errorIcon}>😕</div>
        <h2>Trip not found</h2>
        <p>This link may be invalid or the trip has been deleted.</p>
        <Link to="/auth" className="btn btn-primary" style={{ marginTop: '1rem', display:'inline-flex' }}>
          Sign in to Wandr
        </Link>
      </div>
    </div>
  )

  const { spots = [], days, title, city, cost, status } = trip
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.Upcoming
  const totalDays = spots.length ? Math.max(...spots.map(s => s.day_num ?? 1)) : 1

  const hotelSpots = spots.filter(s => s.category === 'Hotel')
  const nightly    = hotelSpots.length ? Math.max(...hotelSpots.map(s => s.cost)) : 0
  const actSum     = [...new Map(
    spots.filter(s => s.category !== 'Hotel').map(s => [`${s.day_num}-${s.name}`, s])
  ).values()].reduce((a, r) => a + r.cost, 0)
  const miscTotal  = 40 * days

  function formatDate(d) {
    if (!d) return ''
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>✈️ Wandr</div>
          <Link to="/auth" className={`btn btn-primary ${styles.signInBtn}`}>
            Plan your own trip →
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroBadgeRow}>
            <span className={styles.sharedBadge}>🔗 Shared itinerary</span>
            <span className={styles.statusPill}
              style={{ background: `${sc}22`, color: sc, borderColor: sc }}>
              {status}
            </span>
          </div>
          <h1 className={styles.heroCity}>📍 {city}</h1>
          <div className={styles.heroTitle}>"{title}"</div>
          <div className={styles.heroMeta}>
            <span>🗓 {days} day{days > 1 ? 's' : ''}</span>
            {trip.start_date && (
              <span>{formatDate(trip.start_date)} → {formatDate(trip.end_date)}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* ── Budget ── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>💰 Estimated Budget</h3>
          <div className={styles.budgetGrid}>
            <BudgetBox label="Total" amount={cost}
              gradient="linear-gradient(135deg,#1a1a1a,#333)" />
            <BudgetBox label={`Hotel (${days} nights)`} amount={nightly * days}
              gradient="linear-gradient(135deg,#20878E,#92C4C6)" />
            <BudgetBox label="Activities" amount={actSum}
              gradient="linear-gradient(135deg,#92C4C6,#F3C375)" />
            <BudgetBox label="Misc & Transport" amount={miscTotal}
              gradient="linear-gradient(135deg,#F3C375,#D66F29)" />
          </div>
        </div>

        {/* ── Map ── */}
        {spots.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>🗺 All Stops</h3>
            <OverviewMap spots={spots} />
            <div className={styles.mapLegend}>
              <span><span className={styles.dot} style={{ background:'#D66F29' }}>H</span> Hotel</span>
              <span><span className={styles.dot} style={{ background:'#c8860a' }}>1</span> Food</span>
              <span><span className={styles.dot} style={{ background:'#20878E' }}>1</span> Sightseeing</span>
            </div>
          </div>
        )}

        {/* ── Full schedule ── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>📋 Full Schedule</h3>
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
            const daySpots = spots
              .filter(s => s.day_num === d)
              .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
            return (
              <div key={d} className={styles.dayGroup}>
                <button
                  className={styles.dayToggle}
                  onClick={() => setExpanded(prev => ({ ...prev, [d]: !prev[d] }))}
                >
                  <span>Day {d}</span>
                  <span className={styles.toggleArrow}>{expandedDays[d] ? '▲' : '▼'}</span>
                </button>
                {expandedDays[d] && daySpots.map((s, i) => (
                  <ScheduleCard key={i} spot={s} />
                ))}
              </div>
            )
          })}
        </div>

        {/* ── CTA ── */}
        <div className={styles.ctaCard}>
          <div className={styles.ctaText}>
            <div className={styles.ctaHeading}>Want to plan your own trip?</div>
            <div className={styles.ctaSub}>Wandr generates personalised itineraries for you — free to try.</div>
          </div>
          <Link to="/auth" className={`btn btn-primary ${styles.ctaBtn}`}>
            Get started →
          </Link>
        </div>
      </div>
    </div>
  )
}
