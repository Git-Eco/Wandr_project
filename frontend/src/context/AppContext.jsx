import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { getTrips, getLocations, updateTripStatus } from '../api/client'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [session,   setSession]   = useState(undefined)   // undefined = loading
  const [trips,     setTrips]     = useState([])
  const [locations, setLocations] = useState([])
  const [tripsLoaded, setTripsLoaded] = useState(false)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        // Signed out — clear data
        setTrips([])
        setLocations([])
        setTripsLoaded(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load data once authenticated ──────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    loadData()
  }, [session?.user?.id])

  async function loadData() {
    try {
      const [t, l] = await Promise.all([getTrips(), getLocations()])
      const synced = syncStatuses(t)
      setTrips(synced)
      setLocations(l)
      setTripsLoaded(true)
    } catch (e) {
      console.error('Failed to load data:', e)
      setTripsLoaded(true)
    }
  }

  // ── Auto-update trip statuses based on dates ───────────────────────────────
  function syncStatuses(tripList) {
    return tripList.map(t => {
      if (!t.start_date) return t
      const computed = computeStatus(t.start_date, t.days)
      if (computed !== t.status) {
        updateTripStatus(t.id, computed).catch(() => {})
        return { ...t, status: computed }
      }
      return t
    })
  }

  function computeStatus(startDate, days) {
    const start = new Date(startDate + 'T00:00:00')
    const end   = new Date(start.getTime() + (days - 1) * 86400000)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (today < start) return 'Upcoming'
    if (today > end)   return 'Completed'
    return 'Ongoing'
  }

  // ── Trip mutations ─────────────────────────────────────────────────────────
  const addTrip = useCallback((trip) => {
    setTrips(prev => [trip, ...prev])
  }, [])

  const removeTrip = useCallback((id) => {
    setTrips(prev => prev.filter(t => t.id !== id))
  }, [])

  const refreshTrips = useCallback(async () => {
    const t = await getTrips()
    setTrips(syncStatuses(t))
  }, [])

  // ── Sign out ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AppContext.Provider value={{
      session,
      user: session?.user ?? null,
      trips,
      locations,
      tripsLoaded,
      addTrip,
      removeTrip,
      refreshTrips,
      signOut,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
