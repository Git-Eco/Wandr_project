import { useState, useMemo } from 'react'
import { swapSpot } from '../api/client'
import { useToast } from '../context/ToastContext'
import styles from './EditSpotModal.module.css'

const CAT_ICONS = {
  Hotel:'🏨', Food:'🍜', Sightseeing:'🗼',
  Culture:'🎭', Nature:'🌿', History:'🏛️', Art:'🎨',
}

const ALL_CATS = ['Food','Sightseeing','Culture','Nature','History','Art','Hotel']

export default function EditSpotModal({ spot, tripId, locations, onClose, onSwapped }) {
  const toast = useToast()
  const [search, setSearch]     = useState('')
  const [filterCat, setFilterCat] = useState('All')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)

  // Show all spots in the same city — any category, excluding the current spot
  const candidates = useMemo(() => {
    return locations.filter(l => {
      if (l.name === spot.name) return false
      if (l.city !== spot.city) return false
      if (filterCat !== 'All' && l.category !== filterCat) return false
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [locations, spot, search, filterCat])

  async function handleSwap() {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await swapSpot(tripId, spot.id, {
        new_name:     selected.name,
        new_category: selected.category,
        new_type:     selected.type ?? '',
        new_lat:      selected.lat,
        new_lon:      selected.lon,
        new_cost:     selected.cost,
      })
      toast.success(`Swapped to ${selected.name}!`)
      onSwapped(updated)
      onClose()
    } catch (e) {
      toast.error(e.message || 'Could not swap spot.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>🔄 Swap Spot</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Current spot */}
          <div className={styles.currentSpot}>
            <span className={styles.currentLabel}>Replacing</span>
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
          {candidates.length === 0 ? (
            <div className={styles.empty}>No spots found. Try a different category or search term.</div>
          ) : (
            <div className={styles.candidateList}>
              {candidates.map(loc => (
                <button
                  key={loc.name}
                  className={`${styles.candidate} ${selected?.name === loc.name ? styles.candidateActive : ''}`}
                  onClick={() => setSelected(loc)}
                >
                  <span className={styles.candIcon}>{CAT_ICONS[loc.category] ?? '📍'}</span>
                  <div className={styles.candBody}>
                    <div className={styles.candName}>{loc.name}</div>
                    <div className={styles.candMeta}>{loc.category} · {loc.type ?? ''}</div>
                  </div>
                  <div className={styles.candCost}>
                    {loc.cost === 0 ? 'Free' : `$${loc.cost}`}
                  </div>
                  {selected?.name === loc.name && <span className={styles.candCheck}>✓</span>}
                </button>
              ))}
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
              : `Swap to ${selected?.name ?? '…'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
