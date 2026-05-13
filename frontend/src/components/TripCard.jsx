import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWikiPhoto } from '../hooks/useWikiPhoto'
import styles from './TripCard.module.css'

// ── Category icons (mirrors the app-wide constant) ────────────────────────────
const CAT_ICONS = {
  Hotel: '🏨', Food: '🍜', Sightseeing: '🗼',
  Culture: '🎭', Nature: '🌿', History: '🏛️', Art: '🎨',
}

// ── Status badge colours — all via CSS vars so every theme works ──────────────
const STATUS_STYLE = {
  Upcoming:  { icon: '✈', color: 'var(--primary-dark)'        },
  Ongoing:   { icon: '●', color: 'var(--orange-dark)'          },
  Completed: { icon: '✓', color: 'var(--color-text-secondary)' },
}

export default function TripCard({ trip }) {
  const navigate = useNavigate()
  const { city, title, days, status, cost, max_budget, start_date, end_date, spots } = trip
  const { url: photoUrl } = useWikiPhoto(city, city)

  // ── Formatted date range ────────────────────────────────────────────────────
  const dateRange = useMemo(() => {
    if (!start_date) return null
    const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return end_date ? `${fmt(start_date)} – ${fmt(end_date)}` : fmt(start_date)
  }, [start_date, end_date])

  // ── Countdown (upcoming) / progress (ongoing) ───────────────────────────────
  const timeInfo = useMemo(() => {
    if (!start_date) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const s = new Date(start_date + 'T00:00:00')

    if (status === 'Upcoming') {
      return { type: 'upcoming', daysUntil: Math.max(0, Math.round((s - today) / 86_400_000)) }
    }
    if (status === 'Ongoing' && end_date) {
      const e      = new Date(end_date + 'T00:00:00')
      const dayNum = Math.round((today - s) / 86_400_000) + 1
      const total  = Math.round((e - s) / 86_400_000) + 1
      const pct    = Math.min(100, Math.round((dayNum / total) * 100))
      return { type: 'ongoing', dayNum, total, pct }
    }
    return null
  }, [start_date, end_date, status])

  // ── Spot categories (top 4, hotels excluded) ────────────────────────────────
  const categories = useMemo(() => {
    if (!spots?.length) return []
    const counts = {}
    spots.forEach(sp => {
      if (sp.category && sp.category !== 'Hotel')
        counts[sp.category] = (counts[sp.category] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [spots])

  // ── Stat chip 1 — status-specific ──────────────────────────────────────────
  const chip1 = useMemo(() => {
    if (status === 'Upcoming' && timeInfo) {
      return {
        val:    timeInfo.daysUntil === 0 ? '🎉' : timeInfo.daysUntil,
        label:  timeInfo.daysUntil === 0 ? 'today!'   : 'days away',
        accent: true,
      }
    }
    if (status === 'Ongoing' && timeInfo) {
      return { val: timeInfo.dayNum, label: `of ${timeInfo.total} days`, accent: true }
    }
    return { val: '✓', label: 'complete', accent: false }
  }, [status, timeInfo])

  // ── Budget ──────────────────────────────────────────────────────────────────
  const over  = max_budget && cost > max_budget ? cost - max_budget : null
  const under = max_budget != null && cost != null && cost <= max_budget

  const sc       = STATUS_STYLE[status] ?? STATUS_STYLE.Upcoming
  const baseChip = {
    flex: 1, textAlign: 'center', borderRadius: 8, padding: '6px 4px',
    background: 'var(--color-background-secondary)',
    border: '0.5px solid var(--color-border-tertiary)',
  }
  const accentChip = {
    ...baseChip,
    background: 'color-mix(in srgb, var(--primary) 10%, var(--color-background-primary))',
    border: '0.5px solid color-mix(in srgb, var(--primary) 30%, transparent)',
  }

  return (
    <div
      className={styles.card}
      onClick={() => navigate(`/trip/${trip.id}`)}
    >

      {/* ── Photo header ─────────────────────────────────────────────────── */}
      <div style={{
        height: 100,
        background: photoUrl
          ? `linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%),
             url(${photoUrl}) center / cover no-repeat`
          : 'var(--hero-grad)',
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '10px 12px',
        flexShrink: 0,
      }}>

        {/* Status badge */}
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 500,
            padding: '3px 8px', borderRadius: 99,
            background: 'rgba(255,255,255,0.92)',
            color: sc.color,
          }}>
            {sc.icon} {status}
          </span>
        </div>

        {/* City name + date range */}
        <div>
          <div style={{
            fontSize: 20, fontWeight: 500, color: '#fff', lineHeight: 1,
            textShadow: '0 1px 6px rgba(0,0,0,0.4)',
          }}>
            {city}
          </div>
          {dateRange && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
              {dateRange}
            </div>
          )}
        </div>
      </div>

      {/* ── Card body ────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Trip title */}
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: 'var(--color-text-primary)', lineHeight: 1.3,
        }}>
          {title}
        </div>

        {/* Category icons */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {categories.map(([cat]) => (
              <span key={cat} style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'var(--color-background-secondary)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>
                {CAT_ICONS[cat] ?? '📍'}
              </span>
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 3 }}>
              {spots?.length ?? 0} spots
            </span>
          </div>
        )}

        {/* ── 3 stat chips ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6 }}>

          {/* Chip 1: status-specific */}
          <div style={chip1.accent ? accentChip : baseChip}>
            <div style={{
              fontSize: 17, fontWeight: 500, lineHeight: 1,
              color: chip1.accent ? 'var(--primary)' : 'var(--color-text-secondary)',
            }}>
              {chip1.val}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {chip1.label}
            </div>
          </div>

          {/* Chip 2: duration */}
          <div style={baseChip}>
            <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1, color: 'var(--color-text-primary)' }}>
              {days ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>day trip</div>
          </div>

          {/* Chip 3: spots */}
          <div style={baseChip}>
            <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1, color: 'var(--color-text-primary)' }}>
              {spots?.length ?? 0}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>spots</div>
          </div>

        </div>

        {/* ── Ongoing progress bar ──────────────────────────────────────── */}
        {status === 'Ongoing' && timeInfo?.type === 'ongoing' && (
          <div style={{
            background: 'color-mix(in srgb, var(--primary) 8%, var(--color-background-primary))',
            border: '0.5px solid color-mix(in srgb, var(--primary) 25%, transparent)',
            borderRadius: 8, padding: '8px 10px',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10, fontWeight: 500, color: 'var(--primary)', marginBottom: 5,
            }}>
              <span>Day {timeInfo.dayNum} of {timeInfo.total}</span>
              <span>{timeInfo.pct}% complete</span>
            </div>
            <div style={{
              height: 4, borderRadius: 99, overflow: 'hidden',
              background: 'color-mix(in srgb, var(--primary) 20%, transparent)',
            }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: 'var(--primary)',
                width: `${timeInfo.pct}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* ── Budget ───────────────────────────────────────────────────── */}
        {cost != null && (
          <div style={{
            fontSize: 12, color: 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <span>
              Est.{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>
                ${cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </strong>
            </span>
            {over  && (
              <span style={{ fontSize: 11, color: 'var(--orange-dark)', fontWeight: 500 }}>
                ↑ ${Math.round(over).toLocaleString()} over budget
              </span>
            )}
            {under && (
              <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 500 }}>
                ✓ within budget
              </span>
            )}
          </div>
        )}

      </div>

      {/* ── Footer: view trip — always visible for all statuses ──────────── */}
      <div style={{
        padding: '8px 12px',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        flexShrink: 0,
      }}>
        <button
          className={`btn btn-primary btn-full ${styles.openBtn}`}
          onClick={e => { e.stopPropagation(); navigate(`/trip/${trip.id}`) }}
        >
          View trip →
        </button>
      </div>

    </div>
  )
}
