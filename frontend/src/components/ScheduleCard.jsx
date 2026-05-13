import styles from './ScheduleCard.module.css'

const CAT_COLORS = {
  Hotel:       { accent: '#D66F29', bg: '#D66F2912' },
  Food:        { accent: '#c8860a', bg: '#c8860a12' },
  Sightseeing: { accent: '#20878E', bg: '#20878E12' },
  Culture:     { accent: '#7C3AED', bg: '#7C3AED12' },
  Nature:      { accent: '#16a34a', bg: '#16a34a12' },
  History:     { accent: '#b45309', bg: '#b4530912' },
  Art:         { accent: '#db2777', bg: '#db277712' },
}
function catColor(cat) {
  return CAT_COLORS[cat] ?? { accent: '#20878E', bg: '#20878E12' }
}

/* ── Slot icons ── */
const IcoCutlery = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><line x1="7" y1="2" x2="7" y2="22"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>
const IcoSunrise = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/></svg>
const IcoBurger  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h18a8 8 0 0 1-18 0z"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
const IcoSunFull = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IcoWine    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 22h8"/><line x1="12" y1="11" x2="12" y2="22"/><path d="M6 2h12l-4 9a4 4 0 0 1-4 0z"/></svg>
const IcoMoon    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
const IcoPin     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
const IcoSwap    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>

const SLOT_ICONS = {
  Breakfast: IcoCutlery,
  Morning:   IcoSunrise,
  Lunch:     IcoBurger,
  Afternoon: IcoSunFull,
  Dinner:    IcoWine,
  Evening:   IcoMoon,
}

function slotParts(slot) {
  const label = slot.split(' ')[0]
  const Icon  = SLOT_ICONS[label] ?? IcoPin
  return { label, Icon }
}

export default function ScheduleCard({ spot, onSwap, swappable }) {
  const { label, Icon } = slotParts(spot.slot)
  const { accent, bg }  = catColor(spot.category)
  const costStr         = spot.cost === 0 ? 'Free' : `$${spot.cost}`

  return (
    <div className={styles.card} style={{ '--accent': accent, '--bg': bg }}>
      <div className={styles.timeCol}>
        <span className={styles.timeLabel}>{label}</span>
      </div>
      <div className={styles.nodeCol}>
        <div className={styles.nodeDot}>
          <Icon />
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{spot.name}</span>
          <span className={styles.cost}>{costStr}</span>
        </div>
        <div className={styles.tags}>
          <span className={styles.catPill}>{spot.category}</span>
        </div>
      </div>
      {swappable
        ? <button className={styles.swapBtn} onClick={onSwap} title="Swap this spot"><IcoSwap /></button>
        : <div className={styles.swapPlaceholder} />
      }
    </div>
  )
}
