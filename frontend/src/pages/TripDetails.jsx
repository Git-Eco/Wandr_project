import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { getTrip, deleteTrip, regenerateDay } from '../api/client'
import { OverviewMap, DayMap } from '../components/MapView'
import ScheduleCard from '../components/ScheduleCard'
import MemoriesPanel from '../components/MemoriesPanel'
import EditSpotModal from '../components/EditSpotModal'
import styles from './TripDetails.module.css'

// ── Inline SVG icons ─────────────────────────────────────────────
const IcoSun     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IcoCloud   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 0 9z"/></svg>
const IcoRain    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 0 9z"/><line x1="8" y1="23" x2="8" y2="21"/><line x1="12" y1="23" x2="12" y2="21"/><line x1="16" y1="23" x2="16" y2="21"/></svg>
const IcoSnow    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="19.07" y2="4.93"/></svg>
const IcoMist    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="5" y1="16" x2="19" y2="16"/></svg>
const IcoThunder = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 0 9z"/><polyline points="13 11 11 15 13 15 11 19"/></svg>
const IcoThermo  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
const IcoBuilding= () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="9" y2="9"/><line x1="3" y1="15" x2="9" y2="15"/><line x1="15" y1="9" x2="21" y2="9"/><line x1="15" y1="15" x2="21" y2="15"/></svg>
const IcoMapPin  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
const IcoBag     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
const IcoRoute   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
const IcoCalendar = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const IcoShare   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
const IcoDownload= () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IcoTrash   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IcoTicket     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>
const IcoClock      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IcoRefresh    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
const IcoChevronUp  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
const IcoChevronDown= () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>

const WEATHER_ICONS = {
  Clear: IcoSun, Clouds: IcoCloud, Rain: IcoRain, Drizzle: IcoRain,
  Thunderstorm: IcoThunder, Snow: IcoSnow, Mist: IcoMist, Fog: IcoMist,
}
function weatherIcon(c = '') {
  for (const [k, v] of Object.entries(WEATHER_ICONS))
    if (c.toLowerCase().includes(k.toLowerCase())) return v
  return IcoThermo
}

const STATUS_COLORS = {
  Upcoming:'#92C4C6', Ongoing:'#F3C375', Completed:'#20878E',
}
const SLOT_ORDER = ['Breakfast','Morning','Lunch','Afternoon','Dinner','Evening']

// ── PDF export ────────────────────────────────────────────────────────────────
async function exportPDF(trip, spots, totalDays) {
  const html2pdf = (await import('html2pdf.js')).default
  const fmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''
  const hotelSpots = spots.filter(s => s.category === 'Hotel')
  const nightly    = hotelSpots.length ? Math.max(...hotelSpots.map(s => s.cost)) : 0
  const actSum     = [...new Map(spots.filter(s=>s.category!=='Hotel').map(s=>[s.day_num+'-'+s.name,s])).values()].reduce((a,r)=>a+r.cost,0)
  const misc       = 40 * trip.days
  const dayBlocks  = Array.from({length:totalDays},(_,i)=>i+1).map(d => {
    const ds   = spots.filter(s=>s.day_num===d).sort((a,b)=>SLOT_ORDER.indexOf(a.slot)-SLOT_ORDER.indexOf(b.slot))
    const rows = ds.map(s=>'<tr><td style="padding:6px 10px;font-size:12px;color:#555;">'+s.slot+'</td><td style="padding:6px 10px;font-size:12px;font-weight:600;">'+s.name+'</td><td style="padding:6px 10px;font-size:12px;color:#555;">'+s.category+'</td><td style="padding:6px 10px;font-size:12px;text-align:right;color:#20878E;font-weight:700;">'+( s.cost===0?'Free':'$'+s.cost)+'</td></tr>').join('')
    return '<div style="margin-bottom:20px;"><div style="background:#20878E;color:white;padding:7px 12px;font-weight:800;font-size:13px;">Day '+d+'</div><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f5f5f5;"><th style="padding:5px 10px;text-align:left;font-size:11px;color:#888;">Time</th><th style="padding:5px 10px;text-align:left;font-size:11px;color:#888;">Place</th><th style="padding:5px 10px;text-align:left;font-size:11px;color:#888;">Category</th><th style="padding:5px 10px;text-align:right;font-size:11px;color:#888;">Cost</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
  }).join('')
  const content = document.createElement('div')
  content.style.fontFamily = 'Arial, sans-serif'
  content.innerHTML = '<div style="background:linear-gradient(135deg,#20878E,#0d5a60);color:white;border-radius:10px;padding:24px 28px;margin-bottom:20px;"><div style="font-size:11px;opacity:0.7;margin-bottom:4px;">Wandr — Itinerary Export</div><h1 style="font-size:24px;font-weight:800;margin-bottom:3px;">'+trip.city+'</h1><div style="font-size:13px;opacity:0.8;font-style:italic;margin-bottom:10px;">'+trip.title+'</div><div style="font-size:12px;">'+trip.days+' day'+(trip.days>1?'s':'')+(trip.start_date?' · '+fmt(trip.start_date)+' → '+fmt(trip.end_date):'')+' · '+trip.status+'</div></div><h2 style="font-size:15px;font-weight:800;color:#1a1a1a;margin-bottom:14px;">Full Schedule</h2>'+dayBlocks+'<div style="text-align:center;color:#aaa;font-size:11px;margin-top:24px;padding-top:12px;border-top:1px solid #eee;">Generated by Wandr</div>'
  const filename = trip.title.replace(/[^a-z0-9]/gi,'_')+'_Wandr.pdf'
  await html2pdf().set({
    margin:[10,10,10,10], filename,
    image:{type:'jpeg',quality:0.95},
    html2canvas:{scale:2,useCORS:true},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
  }).from(content).save()
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TripDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { removeTrip, trips, locations, tripsLoaded } = useApp()
  const toast = useToast()

  const cached = trips.find(t => t.id === id)
  const [trip, setTrip]           = useState(cached ?? null)
  const locallyModified           = { current: false }  // ref-like: prevents stale context overwrite
  const [loading, setLoading]     = useState(!cached)
  const [tab, setTab]             = useState('overview')   // 'overview' | 'day'
  const [selectedDay, setDay]     = useState(1)
  const [confirmDel, setConfirm]  = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [routeKm, setRouteKm]     = useState(null)
  const [editingSpot, setEditingSpot] = useState(null)
  const [regenLoading, setRegenLoad]  = useState(false)
  const [regenKey, setRegenKey]        = useState(0)
  const [shareToast, setShareToast]   = useState(false)
  const [sidebarOpen, setSidebar]     = useState(false)
  const [expandedDays, setExpanded]   = useState({ 1: true })

  useEffect(() => {
    // Once we've modified trip locally (regen/swap), don't let stale context overwrite it
    if (locallyModified.current) return

    if (tripsLoaded && cached) {
      setTrip(cached)
      setLoading(false)
      return
    }
    if (tripsLoaded && !cached) {
      getTrip(id).then(setTrip).catch(() => setTrip(null)).finally(() => setLoading(false))
      return
    }
  }, [id, tripsLoaded, cached?.id])

  useEffect(() => { setRouteKm(null) }, [selectedDay])

  const handleSpotSwapped = useCallback(async (updated) => {
    locallyModified.current = true
    // Re-fetch so the whole trip is fresh — avoids stale spot IDs on next swap/regen
    try {
      const fresh = await getTrip(id)
      setTrip(fresh)
    } catch {
      // Fallback: patch in-place if fetch fails
      setTrip(prev => !prev ? prev : {
        ...prev,
        spots: prev.spots.map(s => s.id === updated.id ? { ...s, ...updated } : s)
      })
    }
  }, [id])

  async function handleRegenerate() {
    if (status === 'Completed') {
      toast.error('This trip is completed and cannot be modified.')
      return
    }
    if (isDayPast(selectedDay)) {
      toast.error('This day has already passed and cannot be re-rolled.')
      return
    }
    setRegenLoad(true)
    try {
      await regenerateDay(id, selectedDay)
      // Mark as locally modified so the useEffect won't overwrite with stale context
      locallyModified.current = true
      // Always re-fetch from server — ensures spot IDs match what the server has
      const fresh = await getTrip(id)
      setTrip(fresh)
      setRegenKey(k => k + 1)
      toast.success(`Day ${selectedDay} regenerated!`)
    } catch (e) {
      toast.error(e.message || 'Could not regenerate day.')
    } finally {
      setRegenLoad(false)
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/share/${id}`
    navigator.clipboard.writeText(url)
      .then(() => { setShareToast(true); setTimeout(() => setShareToast(false), 2500) })
      .catch(() => prompt('Copy this link:', url))
  }

  async function handleDelete() {
    setDeleting(true)
    try { await deleteTrip(id); removeTrip(id); toast.success('Trip deleted.'); navigate('/') }
    catch { toast.error('Could not delete.'); setDeleting(false); setConfirm(false) }
  }

  function goBack() {
    navigate('/', { state: { view: 'trips' } })
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" style={{ width:32, height:32 }} />
    </div>
  )
  if (!trip) return (
    <div style={{ textAlign:'center', padding:'4rem' }}>
      <p style={{ color:'var(--muted)', marginBottom:'1rem' }}>Trip not found.</p>
      <button className="btn btn-primary" onClick={goBack}>Back to My Trips</button>
    </div>
  )

  const { spots=[], forecast={}, weather, days, title, city, cost, status } = trip
  const cond     = weather?.condition ?? 'Unknown'
  const temp     = weather?.temp ?? '--'
  const sc       = STATUS_COLORS[status] ?? STATUS_COLORS.Upcoming
  const totalDays = spots.length ? Math.max(...spots.map(s => s.day_num ?? 1)) : 1

  // Budget
  const hotelSpots = spots.filter(s => s.category === 'Hotel')
  const nightly    = hotelSpots.length ? Math.max(...hotelSpots.map(s => s.cost)) : 0
  const actSum     = [...new Map(
    spots.filter(s=>s.category!=='Hotel').map(s=>[`${s.day_num}-${s.name}`,s])
  ).values()].reduce((a,r)=>a+r.cost,0)
  const miscTotal  = 40 * days

  // Day data
  const daySpots = spots
    .filter(s => s.day_num === selectedDay)
    .sort((a,b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))

  const dayNightly = (() => {
    const dh = daySpots.filter(s=>s.category==='Hotel')
    return dh.length ? Math.max(...dh.map(s=>s.cost)) : 0
  })()
  const dayActSum = [...new Map(
    daySpots.filter(s=>s.category!=='Hotel').map(s=>[s.name,s])
  ).values()].reduce((a,r)=>a+r.cost,0)

  const forecastDates = Object.keys(forecast).sort()
  const [fc_cond, fc_temp] = forecastDates[selectedDay-1]
    ? (forecast[forecastDates[selectedDay-1]] ?? [cond,temp])
    : [cond,temp]

  const hotelName = hotelSpots[0]?.name ?? null
  // Check if a day is in the past (for ongoing trips)
  function isDayPast(dayNum) {
    if (!trip.start_date) return false
    const dayDate = new Date(trip.start_date + 'T00:00:00')
    dayDate.setDate(dayDate.getDate() + (dayNum - 1))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return dayDate < today
  }

  const isSwappable = s => {
    if (s.name?.includes('(Rest & Settle)')) return false
    if (status === 'Completed') return false
    if (isDayPast(s.day_num)) return false
    return true
  }

  function formatDate(d) {
    if (!d) return ''
    return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
  }

  // ── Desktop sidebar content ───────────────────────────────────────────────
  const DesktopSidebarContent = () => (
    <>
      <div className={styles.sideTripHero}>
        <div className={styles.sideCity}>{city}</div>
        <div className={styles.sideTitle}>"{title}"</div>
        <div className={styles.sideTripMetaRow}>
          <span className={styles.sideStatus} style={{ background:`${sc}22`, color:sc, borderColor:sc }}>
            {status}
          </span>
          <span className={styles.sideDays}>{days} day{days>1?'s':''}</span>
        </div>
        {trip.start_date && (
          <div className={styles.sideTripInfoRow}>
            <IcoCalendar />
            <span className={styles.sideTripInfoText}>
              {formatDate(trip.start_date)} → {formatDate(trip.end_date)}
            </span>
          </div>
        )}
        {hotelName && (
          <div className={styles.sideTripInfoRow}>
            <IcoBuilding />
            <span className={styles.sideTripInfoText}>{hotelName}</span>
          </div>
        )}
      </div>

      <div className={styles.sideBudget}>
        <div className={styles.sideLabel}>Budget Overview</div>
        <div className={styles.sideBudgetTotal}>
          ${Number(cost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <span className={styles.sideBudgetSub}> estimated</span>
        </div>
        <div className={styles.sideBudgetGrid}>
          {[
            { label: `Hotel (${days}n)`, amount: nightly * days, Icon: IcoBuilding, iconBg: 'color-mix(in srgb, var(--primary) 12%, var(--bg-subtle))', iconColor: 'var(--primary)' },
            { label: 'Activities',       amount: actSum,          Icon: IcoMapPin,   iconBg: 'color-mix(in srgb, var(--light) 35%, var(--bg-subtle))',   iconColor: 'var(--primary-dark)' },
            { label: `Misc (${days}d)`,  amount: miscTotal,       Icon: IcoBag,      iconBg: 'color-mix(in srgb, var(--orange) 14%, var(--bg-subtle))',  iconColor: 'var(--orange)' },
          ].map(({ label, amount, Icon, iconBg, iconColor }) => (
            <div key={label} className={styles.sideBudgetCell}>
              <div className={styles.sideBudgetCellIcon} style={{ background: iconBg, color: iconColor }}>
                <Icon />
              </div>
              <div className={styles.sideBudgetCellVal}>
                ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className={styles.sideBudgetCellLbl}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.sideDayNav}>
        <div className={styles.sideLabel}>Days</div>
        {Array.from({length:totalDays},(_,i)=>i+1).map(d => {
          const count = spots.filter(s=>s.day_num===d).length
          return (
            <button key={d}
              className={`${styles.dayNavItem} ${selectedDay===d && tab==='day' ? styles.dayNavActive : ''}`}
              onClick={() => { setDay(d); setTab('day') }}>
              <span className={styles.dayNavNum}>Day {d}</span>
              <span className={styles.dayNavCount}>{count} stops</span>
            </button>
          )
        })}
      </div>

      <div className={styles.sideActions}>
        <button className={styles.actionBtn} onClick={handleShare}>
          <IcoShare /> Share Trip
        </button>
        <button className={styles.actionBtn} onClick={() => exportPDF(trip, spots, totalDays)}>
          <IcoDownload /> Export PDF
        </button>
        {confirmDel ? (
          <div className={styles.deleteConfirm}>
            <p>This will permanently delete the trip.</p>
            <div style={{display:'flex',gap:'6px',marginTop:'6px'}}>
              <button className={`${styles.actionBtn} ${styles.actionBtnDanger} ${styles.actionBtnFlex}`}
                onClick={handleDelete} disabled={deleting}>
                <IcoTrash /> {deleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
              <button className={`${styles.actionBtn} ${styles.actionBtnFlex}`} onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setConfirm(true)}>
            <IcoTrash /> Delete Trip
          </button>
        )}
      </div>
    </>
  )

  // ── Mobile sheet content ─────────────────────────────────────────────────
const MobileSheetContent = () => (
  <div className={styles.sheetBody}>

    {/* Trip identity + weather */}
    <div className={styles.sheetTopRow}>
      <div className={styles.sheetTripInfo}>
        <div className={styles.sheetCity}>{city}</div>
        <div className={styles.sheetTripTitle}>"{title}"</div>
        <div className={styles.sideTripMetaRow}>
          <span className={styles.sideStatus} style={{ background:`${sc}22`, color:sc, borderColor:sc }}>
            {status}
          </span>
          <span className={styles.sideDays}>{days} day{days>1?'s':''}</span>
        </div>
        {trip.start_date && (
          <div className={styles.sideTripInfoRow}>
            <IcoCalendar />
            <span className={styles.sideTripInfoText}>
              {formatDate(trip.start_date)} → {formatDate(trip.end_date)}
            </span>
          </div>
        )}
        {hotelName && (
          <div className={styles.sideTripInfoRow}>
            <IcoBuilding />
            <span className={styles.sideTripInfoText}>{hotelName}</span>
          </div>
        )}
      </div>

      {/* Weather + Distance stacked on the right */}
      <div style={{ display:'flex', flexDirection:'column', gap:'6px', flexShrink:0 }}>
        <div className={styles.sheetWeatherPill}>
          <span className={styles.sheetWeatherIcon}>
            {(() => { const W = weatherIcon(fc_cond); return <W /> })()}
          </span>
          <div className={styles.sheetWeatherText}>
            <span className={styles.sheetWeatherTemp}>{fc_temp}°C</span>
            <span className={styles.sheetWeatherCond}>{fc_cond}</span>
          </div>
        </div>
        {routeKm !== null && routeKm > 0 && (
          <div className={styles.sheetWeatherPill}>
            <span className={styles.sheetWeatherIcon}><IcoRoute /></span>
            <div className={styles.sheetWeatherText}>
              <span className={styles.sheetWeatherTemp}>{routeKm.toFixed(1)} km</span>
              <span className={styles.sheetWeatherCond}>Drive dist.</span>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Budget summary */}
    <div className={styles.sheetSection}>
      <div className={styles.sheetSectionLabel}>Budget</div>
      <div className={styles.sheetTripTotalRow}>
        <span className={styles.sheetTripTotalLabel}>Est. total</span>
        <span className={styles.sheetTripTotalAmt}>
          ${Number(cost).toLocaleString(undefined,{maximumFractionDigits:0})}
        </span>
      </div>
      <div className={styles.sideBudgetGrid}>
        {[
          { label: `Hotel (${days}n)`, amount: nightly * days, Icon: IcoBuilding, iconBg: 'color-mix(in srgb, var(--primary) 12%, var(--bg-subtle))', iconColor: 'var(--primary)' },
          { label: 'Activities',       amount: actSum,          Icon: IcoMapPin,   iconBg: 'color-mix(in srgb, var(--light) 35%, var(--bg-subtle))',   iconColor: 'var(--primary-dark)' },
          { label: `Misc (${days}d)`,  amount: miscTotal,       Icon: IcoBag,      iconBg: 'color-mix(in srgb, var(--orange) 14%, var(--bg-subtle))',  iconColor: 'var(--orange)' },
        ].map(({ label, amount, Icon, iconBg, iconColor }) => (
          <div key={label} className={styles.sideBudgetCell}>
            <div className={styles.sideBudgetCellIcon} style={{ background: iconBg, color: iconColor }}>
              <Icon />
            </div>
            <div className={styles.sideBudgetCellVal}>
              ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className={styles.sideBudgetCellLbl}>{label}</div>
          </div>
        ))}
      </div>

      {/* Day budget — shown on mobile when in day view */}
      {tab === 'day' && (
        <div className={styles.sheetDayBudget}>
          <div className={styles.sheetDayBudgetLabel}>Day {selectedDay} Budget</div>
          {(() => {
            const total = dayNightly + dayActSum + 40
            const rows = [
              { label: 'Hotel',      amount: dayNightly, Icon: IcoBuilding, iconBg: 'color-mix(in srgb, var(--primary) 12%, var(--bg-subtle))', iconColor: 'var(--primary)',     barColor: 'var(--primary)' },
              { label: 'Activities', amount: dayActSum,  Icon: IcoMapPin,   iconBg: 'color-mix(in srgb, var(--light) 35%, var(--bg-subtle))',   iconColor: 'var(--primary-dark)', barColor: 'var(--light)'   },
              { label: 'Misc',       amount: 40,         Icon: IcoBag,      iconBg: 'color-mix(in srgb, var(--orange) 14%, var(--bg-subtle))',  iconColor: 'var(--orange)',      barColor: 'var(--orange)'  },
            ]
            return (
              <div className={styles.dayBudgetGrid}>
                {rows.map(({ label, amount, Icon, iconBg, iconColor, barColor }) => {
                  const pct = total > 0 ? Math.round((amount / total) * 100) : 0
                  return (
                    <div key={label} className={styles.dbBox}>
                      <div className={styles.dbIcon} style={{ background: iconBg, color: iconColor }}>
                        <Icon />
                      </div>
                      <div className={styles.dbBody}>
                        <div className={styles.dbTop}>
                          <span className={styles.dbLabel}>{label}</span>
                          <span className={styles.dbAmount}>${Number(amount).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                        </div>
                        <div className={styles.dbTrack}>
                          <div className={styles.dbFill} style={{ width:`${pct}%`, background: barColor }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className={styles.dbBoxTotal}>
                  <span className={styles.dbTotalLabel}>Day total</span>
                  <span className={styles.dbTotalAmount}>${Number(total).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>

    {/* Day selector */}
    <div className={styles.sheetSection}>
      <div className={styles.sheetSectionLabel}>Jump to Day</div>
      <div className={styles.sheetDayChips}>
        {Array.from({length:totalDays},(_,i)=>i+1).map(d => {
          const past  = isDayPast(d)
          const count = spots.filter(s=>s.day_num===d && s.category!=='Hotel').length
          return (
            <button key={d}
              className={`${styles.sheetDayChip} ${selectedDay===d && tab==='day' ? styles.sheetDayChipActive : ''} ${past ? styles.sheetDayChipPast : ''}`}
              onClick={() => { setDay(d); setTab('day'); setSidebar(false) }}>
              <span className={styles.sheetDayChipNum}>{d}</span>
              <span className={styles.sheetDayChipCount}>{count}s</span>
              {past && <span className={styles.dayChipPastDot} />}
            </button>
          )
        })}
      </div>
    </div>

    {/* Actions */}
    <div className={styles.sheetActions}>
      <button className={styles.sheetActionBtn} onClick={handleShare}>
        <IcoShare /> Share
      </button>
      <button className={styles.sheetActionBtn} onClick={() => exportPDF(trip, spots, totalDays)}>
        <IcoDownload /> PDF
      </button>
      {confirmDel ? (
        <div className={styles.sheetDeleteConfirm}>
          <span>Delete this trip?</span>
          <button className={styles.sheetDeleteYes} onClick={handleDelete} disabled={deleting}>
            {deleting ? '…' : 'Yes'}
          </button>
          <button className={styles.sheetActionBtn} onClick={() => setConfirm(false)}>No</button>
        </div>
      ) : (
        <button className={`${styles.sheetActionBtn} ${styles.sheetActionBtnDanger}`} onClick={() => setConfirm(true)}>
          <IcoTrash /> Delete
        </button>
      )}
    </div>
  </div>
)

  return (
    <div className={styles.shell}>

      {/* ══ LEFT SIDEBAR (desktop) ══ */}
      <aside className={styles.sidebar}>
        <button className={styles.backBtn} onClick={goBack}>← Back</button>
        <DesktopSidebarContent />
      </aside>

      {/* ══ MAIN CONTENT ══ */}
      <main className={styles.main}>

        {/* Top bar — Row 1: tabs + re-roll + Details; Row 2: day chips */}
        <div className={styles.topBar}>

          {/* ── Row 1 ── */}
          <div className={styles.topBarRow1}>
            <button className={styles.mobileBack} onClick={goBack}>← Back</button>

            {/* Tab switcher */}
            <div className={styles.tabSwitcher}>
              <button
                className={`${styles.tabBtn} ${tab==='overview' ? styles.tabBtnActive : ''}`}
                onClick={() => setTab('overview')}>
                Overview
              </button>
              <button
                className={`${styles.tabBtn} ${tab==='day' ? styles.tabBtnActive : ''}`}
                onClick={() => setTab('day')}>
                Day {selectedDay}
              </button>
            </div>

            {/* Re-roll + Details — pushed to the right */}
            <div className={styles.dayControls}>
              {/* Weather pill — shown on tablet where right panel is hidden */}
              <div className={styles.weatherPill}>
                {(() => { const W = weatherIcon(fc_cond); return <W /> })()}
                <span className={styles.weatherPillTemp}>{fc_temp}°C</span>
              </div>
              {tab === 'day' && (
                <button
                  className={styles.regenBtn}
                  onClick={handleRegenerate}
                  disabled={regenLoading}>
                  {regenLoading ? <span className="spinner" style={{width:12,height:12}}/> : <IcoRefresh />}
                  <span className={styles.regenBtnLabel}>Re-roll Day</span>
                </button>
              )}
              <button className={styles.sidebarToggle} onClick={() => setSidebar(true)}>
                Details
              </button>
            </div>
          </div>

          {/* ── Row 2: day chips — scrollable, never wraps ── */}
          {tab === 'day' && (
            <div className={styles.topBarRow2}>
              <div className={styles.dayChips}>
                {Array.from({length:totalDays},(_,i)=>i+1).map(d => {
                  const past = isDayPast(d)
                  return (
                    <button key={d}
                      className={`${styles.dayChip} ${selectedDay===d ? styles.dayChipActive : ''} ${past ? styles.dayChipPast : ''}`}
                      onClick={() => setDay(d)}
                      title={past ? 'Day completed' : undefined}>
                      {d}
                      {past && <span className={styles.dayChipPastDot} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* ══ OVERVIEW TAB ══ */}
        {tab === 'overview' && (
          <div className={styles.overviewContent}>

            {/* ── Trip Highlights ── */}
            {(() => {
              const actSpots = spots.filter(s => s.category !== 'Hotel')

              // Category breakdown
              const catCounts = actSpots.reduce((acc, s) => {
                acc[s.category] = (acc[s.category] ?? 0) + 1
                return acc
              }, {})
              const catTotal = actSpots.length || 1
              const CAT_COLORS_HL = {
                Food: '#c8860a', Sightseeing: '#20878E', Culture: '#7C3AED',
                Nature: '#16a34a', History: '#b45309', Art: '#db2777',
              }

              // Most expensive day
              const dayCosts = Array.from({ length: totalDays }, (_, i) => {
                const d = i + 1
                const ds = spots.filter(s => s.day_num === d)
                const dh = ds.filter(s => s.category === 'Hotel')
                const dn = dh.length ? Math.max(...dh.map(s => s.cost)) : 0
                const da = [...new Map(ds.filter(s=>s.category!=='Hotel').map(s=>[s.name,s])).values()]
                  .reduce((a,r) => a + r.cost, 0)
                return { day: d, total: dn + da + 40 }
              })
              const peakDay = dayCosts.reduce((a, b) => b.total > a.total ? b : a, dayCosts[0] ?? { day: 1, total: 0 })

              // Pacing — slot distribution
              const slotCounts = { Morning: 0, Afternoon: 0, Evening: 0 }
              actSpots.forEach(s => {
                const key = Object.keys(slotCounts).find(k => s.slot?.startsWith(k))
                if (key) slotCounts[key]++
              })

              // Free vs paid
              const freeCount = actSpots.filter(s => s.cost === 0).length
              const paidCount = actSpots.length - freeCount

              return (
                <div className={styles.highlights}>

                  {/* Category breakdown bar */}
                  <div className={styles.hlCard}>
                    <div className={styles.hlLabel}>What you're doing</div>
                    <div className={styles.catBar}>
                      {Object.entries(catCounts)
                        .sort((a,b) => b[1]-a[1])
                        .map(([cat, count]) => (
                          <div
                            key={cat}
                            className={styles.catBarSegment}
                            style={{
                              width: `${(count/catTotal)*100}%`,
                              background: CAT_COLORS_HL[cat] ?? '#20878E',
                            }}
                            title={`${cat}: ${count} stop${count>1?'s':''}`}
                          />
                        ))
                      }
                    </div>
                    <div className={styles.catLegend}>
                      {Object.entries(catCounts)
                        .sort((a,b) => b[1]-a[1])
                        .map(([cat, count]) => (
                          <div key={cat} className={styles.catLegendItem}>
                            <span className={styles.catLegendDot} style={{ background: CAT_COLORS_HL[cat] ?? '#20878E' }} />
                            <span className={styles.catLegendName}>{cat}</span>
                            <span className={styles.catLegendCount}>{count}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  {/* Stat row */}
                  <div className={styles.hlStatRow}>
                    <div className={styles.hlStat}>
                      <div className={styles.hlStatIcon}><IcoCalendar /></div>
                      <div className={styles.hlStatBody}>
                        <div className={styles.hlStatVal}>Day {peakDay.day}</div>
                        <div className={styles.hlStatDesc}>Priciest day · ${Number(peakDay.total).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                      </div>
                    </div>

                    <div className={styles.hlStat}>
                      <div className={styles.hlStatIcon}><IcoTicket /></div>
                      <div className={styles.hlStatBody}>
                        <div className={styles.hlStatVal}>{freeCount} free</div>
                        <div className={styles.hlStatDesc}>{paidCount} paid stop{paidCount!==1?'s':''}</div>
                      </div>
                    </div>

                    <div className={styles.hlStat}>
                      <div className={styles.hlStatIcon}><IcoClock /></div>
                      <div className={styles.hlStatBody}>
                        <div className={styles.hlStatVal}>
                          {Object.entries(slotCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '—'}
                        </div>
                        <div className={styles.hlStatDesc}>Most active slot</div>
                      </div>

                    </div>
                  </div>       
                </div>
              )
            })()}

            {/* Full trip map */}
            <div className={styles.overviewMapWrap}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>All Stops</h3>
                <div className={styles.mapLegend}>
                  <span><span className={styles.dot} style={{background:'#D66F29'}}>H</span> Hotel</span>
                  <span><span className={styles.dot} style={{background:'#c8860a'}}>1</span> Food</span>
                  <span><span className={styles.dot} style={{background:'#20878E'}}>1</span> Sightseeing</span>
                </div>
              </div>
              {spots.length > 0
                ? <OverviewMap spots={spots} />
                : <div className={styles.empty}>No spots yet.</div>}
            </div>

            {/* Full schedule — collapsible per day */}
            <div className={styles.overviewSchedule}>
              <h3 className={styles.sectionTitle}>Full Schedule</h3>
              {Array.from({length:totalDays},(_,i)=>i+1).map(d => {
                const ds = spots.filter(s=>s.day_num===d)
                  .sort((a,b)=>SLOT_ORDER.indexOf(a.slot)-SLOT_ORDER.indexOf(b.slot))
                return (
                  <div key={d} className={styles.dayBlock}>
                    <button
                      className={styles.dayToggle}
                      onClick={() => setExpanded(p=>({...p,[d]:!p[d]}))}>
                      <span className={styles.dayToggleLabel}>Day {d}</span>
                      <span className={styles.dayToggleMeta}>{ds.length} stops</span>
                      <span className={styles.dayToggleArrow}>{expandedDays[d] ? <IcoChevronUp /> : <IcoChevronDown />}</span>
                    </button>
                    {expandedDays[d] && (
                      <div className={styles.timeline}>
                        {ds.map((s,i) => (
                          <ScheduleCard
                            key={i}
                            spot={s}
                            swappable={isSwappable(s)}
                            onSwap={() => setEditingSpot(s)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ DAY TAB ══ */}
        {tab === 'day' && (
          <div className={styles.dayContent}>
            {/* Day map */}
            <div className={styles.dayMapWrap}>
              <DayMap
                spots={daySpots}
                dayKey={`day-${selectedDay}-${regenKey}`}
                onDistanceCalculated={setRouteKm}
              />
              <div className={styles.mapLegend}>
                <span><span className={styles.dot} style={{background:'#D66F29'}}>H</span> Hotel</span>
                <span><span className={styles.dot} style={{background:'#c8860a'}}>1</span> Food</span>
                <span><span className={styles.dot} style={{background:'#20878E'}}>1</span> Sightseeing</span>
              </div>
            </div>

            {/* Day schedule */}
            <div className={styles.daySchedule}>
              <h3 className={styles.sectionTitle}>Day {selectedDay} Schedule</h3>
              {daySpots.length === 0
                ? <div className={styles.empty}>No spots for this day.</div>
                : (
                  <div className={styles.timeline}>
                    {daySpots.map((s,i) => (
                      <ScheduleCard
                        key={i}
                        spot={s}
                        swappable={isSwappable(s)}
                        onSwap={() => setEditingSpot(s)}
                      />
                    ))}
                  </div>
                )}
            </div>

            {/* Memories */}
            <MemoriesPanel tripId={id} dayNum={selectedDay} />
          </div>
        )}
      </main>

      {/* ══ RIGHT PANEL (desktop only — weather + day budget) ══ */}
      <aside className={styles.rightPanel}>
        <div className={styles.rpCard}>
          <div className={styles.rpLabel}>
            {tab === 'day' ? `Day ${selectedDay} Weather` : 'Current Weather'}
          </div>

          {/* Weather: icon box + temp + condition */}
          <div className={styles.weatherRow}>
            <div className={styles.weatherIconBox}>
              {(() => { const W = weatherIcon(fc_cond); return <W /> })()}
            </div>
            <div className={styles.weatherInfo}>
              <div className={styles.weatherTemp}>{fc_temp}°C</div>
              <div className={styles.weatherCond}>{fc_cond}</div>
            </div>
          </div>

          {/* Distance — same row style as budget rows */}
          {routeKm !== null && routeKm > 0 && (
            <div className={styles.distRow}>
              <div className={styles.distIconBox}><IcoRoute /></div>
              <div className={styles.distBody}>
                <div className={styles.distLabel}>Drive distance</div>
                <div className={styles.distValue}>{routeKm.toFixed(1)} km</div>
              </div>
            </div>
          )}
        </div>

        {tab === 'day' && (
          <div className={styles.rpCard}>
            <div className={styles.rpLabel}>Day {selectedDay} Budget</div>
            {(() => {
              const total = dayNightly + dayActSum + 40
              const rows = [
                { label: 'Hotel',      amount: dayNightly, Icon: IcoBuilding, iconBg: 'color-mix(in srgb, var(--primary) 12%, var(--bg-subtle))', iconColor: 'var(--primary)',     barColor: 'var(--primary)' },
                { label: 'Activities', amount: dayActSum,  Icon: IcoMapPin,   iconBg: 'color-mix(in srgb, var(--light) 35%, var(--bg-subtle))',   iconColor: 'var(--primary-dark)', barColor: 'var(--light)'   },
                { label: 'Misc',       amount: 40,         Icon: IcoBag,      iconBg: 'color-mix(in srgb, var(--orange) 14%, var(--bg-subtle))',  iconColor: 'var(--orange)',      barColor: 'var(--orange)'  },
              ]
              return (
                <div className={styles.dayBudgetGrid}>
                  {rows.map(({ label, amount, Icon, iconBg, iconColor, barColor }) => {
                    const pct = total > 0 ? Math.round((amount / total) * 100) : 0
                    return (
                      <div key={label} className={styles.dbBox}>
                        <div className={styles.dbIcon} style={{ background: iconBg, color: iconColor }}>
                          <Icon />
                        </div>
                        <div className={styles.dbBody}>
                          <div className={styles.dbTop}>
                            <span className={styles.dbLabel}>{label}</span>
                            <span className={styles.dbAmount}>${Number(amount).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                          </div>
                          <div className={styles.dbTrack}>
                            <div className={styles.dbFill} style={{ width:`${pct}%`, background: barColor }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className={styles.dbBoxTotal}>
                    <span className={styles.dbTotalLabel}>Day total</span>
                    <span className={styles.dbTotalAmount}>${Number(total).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {tab === 'overview' && (
          <div className={styles.rpCard}>
            <div className={styles.rpLabel}>Trip at a Glance</div>
            <div className={styles.glanceList}>
              <div className={styles.glanceRow}><span>Total days</span><strong>{days}</strong></div>
              <div className={styles.glanceRow}><span>Total stops</span><strong>{spots.length}</strong></div>
              <div className={styles.glanceRow}><span>Hotels</span><strong>{hotelSpots.length > 0 ? hotelSpots[0].name.split(' ').slice(0,2).join(' ') : '—'}</strong></div>
              <div className={styles.glanceRow}><span>Est. total</span><strong>${Number(cost).toLocaleString(undefined,{maximumFractionDigits:0})}</strong></div>
            </div>
          </div>
        )}
      </aside>

      {/* ══ MOBILE BOTTOM BAR ══ */}
      <div className={styles.mobileBar}>
        <button className={`${styles.mobileBarBtn} ${tab==='overview'?styles.mobileBarBtnActive:''}`}
          onClick={() => setTab('overview')}>
          Overview
        </button>
        <button className={`${styles.mobileBarBtn} ${tab==='day'?styles.mobileBarBtnActive:''}`}
          onClick={() => setTab('day')}>
          Day {selectedDay}
        </button>
        <button className={styles.mobileBarBtn} onClick={() => setSidebar(true)}>
          Details
        </button>
      </div>

      {/* ══ MOBILE SIDEBAR SHEET ══ */}
      {sidebarOpen && (
        <div className={styles.sheetOverlay} onClick={() => setSidebar(false)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetScroll}>
              <MobileSheetContent />
            </div>
          </div>
        </div>
      )}

      {/* ── Modals & toasts ── */}
      {editingSpot && (
        <EditSpotModal
          spot={editingSpot}
          tripId={id}
          trips={spots}
          locations={locations}
          onClose={() => setEditingSpot(null)}
          onSwapped={handleSpotSwapped}
        />
      )}

      {shareToast && (
        <div className={styles.shareToast}>Link copied to clipboard</div>
      )}
    </div>
  )
}
