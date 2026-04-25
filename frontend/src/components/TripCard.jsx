import { useNavigate } from 'react-router-dom'
import styles from './TripCard.module.css'

const STATUS_COLORS = {
  Upcoming:  { bg: '#92C4C622', text: '#20878E', border: '#92C4C6' },
  Ongoing:   { bg: '#F3C37522', text: '#c8860a', border: '#F3C375' },
  Completed: { bg: '#20878E22', text: '#20878E', border: '#20878E' },
}

export default function TripCard({ trip }) {
  const navigate = useNavigate()
  const { city, title, days, status, cost, max_budget } = trip
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.Upcoming

  const over  = max_budget && cost > max_budget ? cost - max_budget : null
  const under = max_budget && cost <= max_budget

  return (
    <div className={styles.card} onClick={() => navigate(`/trip/${trip.id}`)}>
      <div className={styles.top}>
        <h3 className={styles.city}>📍 {city}</h3>
        <span className={styles.statusBadge} style={{
          background: sc.bg, color: sc.text, borderColor: sc.border
        }}>
          {status}
        </span>
      </div>

      <div className={styles.tripTitle}>"{title}"</div>

      <div className={styles.meta}>
        <span className={styles.daysBadge}>
          🗓 {days} day{days > 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.budget}>
        Estimated: <strong>${cost?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
        {over  && <span className={styles.over}> (${over.toFixed(0)} over budget)</span>}
        {under && <span className={styles.under}> (within budget ✓)</span>}
      </div>

      <button
        className={`btn btn-primary btn-full ${styles.openBtn}`}
        onClick={e => { e.stopPropagation(); navigate(`/trip/${trip.id}`) }}
      >
        Open trip →
      </button>
    </div>
  )
}
