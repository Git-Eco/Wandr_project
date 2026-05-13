import { useState, useMemo } from 'react'
import { swapSpot } from '../api/client'
import { useToast } from '../context/ToastContext'
import styles from './EditSpotModal.module.css'

const CAT_ICONS = {
  Hotel:'🏨', Food:'🍜', Sightseeing:'🗼',
  Culture:'🎭', Nature:'🌿', History:'🏛️', Art:'🎨',
}

const ALL_CATS = ['Food','Sightseeing','Culture','Nature','History','Art','Hotel']

export default function EditSpotModal({ spot, tripId, trips, locations, onClose, onSwapped }) {
  const toast = useToast()
  const [search, setSearch]       = useState('')
  const [filterCat, setFilterCat] = useState(spot.category)  // default to same category
  const [selected, setSelected]   = useState(null)
  const [saving, setSaving]       = useState(false)

  const isHotel = spot.category === 'Hotel'

  // Names already used anywhere in the trip (excluding the spot being replaced)
  const usedNames = useMemo(() => {
    const allSpots = trips ?? []
    return new Set(
      allSpots
        .filter(s => s.name !== spot.name)
        .map(s => s.name)
    )
  }, [trips, spot.name])

  // Split candidates into "available" (not yet used) and "already visited" (fallback)
  const { available, visited } = useMemo(() => {
    const inCity = locations.filter(l => {
      if (l.name === spot.name) return false
      if (l.city !== spot.city) return false
      if (filterCat !== 'All' && l.category !== filterCat) return false
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

    const avail   = inCity.filter(l => !usedNames.has(l.name))
    const visited = inCity.filter(l =>  usedNames.has(l.name))

    // If nothing available (pool exhausted), fall back to showing visited ones
    return avail.length > 0
      ? { available: avail, visited: [] }
      : { available: [], visited }
  }, [locations, spot, filterCat, search, usedNames])

  async function handleSwap() {
    if (!selected) return
    setSaving(true)
    try {
      const payload = {
        new_name:     selected.name,
        new_category: selected.category,
        new_type:     selected.type ?? '',
        new_lat:      selected.lat,
        new_lon:      selected.lon,
        new_cost:     selected.cost,
      }

      if (isHotel) {
        // Swap ALL hotel spots across every day to keep hotel consistent
        const hotelSpots = (trips ?? []).filter(s => s.category === 'Hotel')
        await Promise.all(hotelSpots.map(s => swapSpot(tripId, s.id, payload)))
        toast.success(`Hotel updated to ${selected.name} for all days!`)
      } else {
        const updated = await swapSpot(tripId, spot.id, payload)
        toast.success(`Swapped to ${selected.name}!`)
        onSwapped(updated)
      }

      onSwapped(selected)  // trigger parent re-fetch
      onClose()
    } catch (e) {
      toast.error(e.message || 'Could not swap spot.')
    } finally {
      setSaving(false)
    }
  }

  const isEmpty = available.length === 0 && visited.length === 0

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>🔄 {isHotel ? 'Change Hotel' : 'Swap Spot'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Current spot */}
          <div className={styles.currentSpot}>
            <span className={styles.currentLabel}>
              {isHotel ? 'Changing hotel for all days' : 'Replacing'}
            </span>
            <div className={styles.currentName}>
              {CAT_ICONS[spot.category] ?? '📍'} {spot.name}
            </div>
            <div className={styles.currentMeta}>{spot.category} · {spot.slot}</div>
          </div>

          {/* Category filter pills */}
          <div className={styles.catFilter}>
            {['All', ...ALL_CATS].map(c => (
              <span
                key={c}
                className={`pill ${filterCat === c ? 'active' : ''}`}
                onClick={() => setFilterCat(c)}
              >
                {c === 'All' ? '🌐 All' : `${CAT_ICONS[c] ?? ''} ${c}`}
              </span>
            ))}
          </div>

          {/* Search */}
          <div className="form-group" style={{ marginBottom: '0.9rem' }}>
            <input
              placeholder={`Search spots in ${spot.city}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Results */}
          {isEmpty ? (
            <div className={styles.empty}>No spots found. Try a different category or search term.</div>
          ) : (
            <div className={styles.candidateList}>

              {/* Available (not yet visited) */}
              {available.map(loc => (
                <CandidateRow
                  key={loc.name}
                  loc={loc}
                  selected={selected}
                  onSelect={setSelected}
                />
              ))}

              {/* Visited fallback — only shown when pool is exhausted */}
              {visited.length > 0 && (
                <>
                  <div className={styles.sectionDivider}>
                    All {filterCat === 'All' ? '' : filterCat + ' '}spots visited — showing again
                  </div>
                  {visited.map(loc => (
                    <CandidateRow
                      key={loc.name}
                      loc={loc}
                      selected={selected}
                      onSelect={setSelected}
                      dimmed
                    />
                  ))}
                </>
              )}
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: '1rem' }}
            onClick={handleSwap}
            disabled={!selected || saving}
          >
            {saving
              ? <span className="spinner" style={{ width: 16, height: 16 }} />
              : isHotel
                ? `Switch to ${selected?.name ?? '…'} (all days)`
                : `Swap to ${selected?.name ?? '…'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function CandidateRow({ loc, selected, onSelect, dimmed }) {
  return (
    <button
      className={`${styles.candidate} ${selected?.name === loc.name ? styles.candidateActive : ''} ${dimmed ? styles.candidateDimmed : ''}`}
      onClick={() => onSelect(loc)}
    >
      <span className={styles.candIcon}>{CAT_ICONS[loc.category] ?? '📍'}</span>
      <div className={styles.candBody}>
        <div className={styles.candName}>{loc.name}</div>
        <div className={styles.candMeta}>{loc.category}{loc.type ? ` · ${loc.type}` : ''}</div>
      </div>
      <div className={styles.candCost}>
        {loc.cost === 0 ? 'Free' : `$${loc.cost}`}
      </div>
      {selected?.name === loc.name && <span className={styles.candCheck}>✓</span>}
    </button>
  )
}
