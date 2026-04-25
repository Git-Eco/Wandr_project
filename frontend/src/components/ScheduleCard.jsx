import styles from './ScheduleCard.module.css'

const CAT_COLORS = {
  Hotel: { bg: '#D66F2922', text: '#D66F29' },
  Food:  { bg: '#c8860a22', text: '#c8860a' },
}
function catColor(cat) {
  return CAT_COLORS[cat] ?? { bg: '#20878E22', text: '#20878E' }
}

function slotParts(slot) {
  const parts = slot.split(' ')
  if (parts.length >= 2) return { label: parts[0], emoji: parts[parts.length - 1] }
  return { label: slot, emoji: '📌' }
}

export default function ScheduleCard({ spot }) {
  const { label, emoji } = slotParts(spot.slot)
  const cc = catColor(spot.category)
  const costStr = spot.cost === 0 ? 'Free' : `$${spot.cost}`

  return (
    <div className={`${styles.card} ${styles[spot.category?.toLowerCase()] ?? ''}`}>
      <span className={styles.emoji}>{emoji}</span>
      <div className={styles.body}>
        <div className={styles.name}>{spot.name}</div>
        <div className={styles.meta}>
          <span className={styles.slot}>{label}</span>
          <span className={styles.pill} style={{ background: cc.bg, color: cc.text }}>
            {spot.category}
          </span>
        </div>
      </div>
      <div className={styles.cost}>{costStr}</div>
    </div>
  )
}
