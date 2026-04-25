import { supabase } from '../supabase'

const BASE = '/api'

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function request(method, path, body) {
  const headers = await authHeaders()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ── Memories ──────────────────────────────────────────────────────────────────
export const getDayMemories  = (tripId, dayNum) => request('GET',    `/memories/${tripId}/${dayNum}`)
export const saveMemory      = (body)            => request('POST',   '/memories', body)
export const updateMemory    = (id, body)        => request('PATCH',  `/memories/${id}`, body)
export const deleteMemory    = (id)              => request('DELETE', `/memories/${id}`)

// ── Profile ───────────────────────────────────────────────────────────────────
export const getProfile     = ()       => request('GET',    '/profile')
export const updateProfile  = (body)   => request('PATCH',  '/profile', body)
export const deleteAccount  = ()       => request('DELETE', '/profile')

// ── Locations ─────────────────────────────────────────────────────────────────
export const getLocations = () => request('GET', '/locations')

// ── Trips ─────────────────────────────────────────────────────────────────────
export const getTrips         = ()               => request('GET',    '/trips')
export const getTrip          = (id)             => request('GET',    `/trips/${id}`)
export const generateTrip     = (body)           => request('POST',   '/trips/generate', body)
export const deleteTrip       = (id)             => request('DELETE', `/trips/${id}`)
export const updateTripStatus = (id, status)     => request('PATCH',  `/trips/${id}/status`, { status })
export const swapSpot         = (tripId, spotId, body) => request('PATCH', `/trips/${tripId}/spots/${spotId}`, body)
export const regenerateDay    = (tripId, dayNum) => request('POST',   `/trips/${tripId}/regenerate-day`, { day_num: dayNum })

// ── Public share (no auth) ────────────────────────────────────────────────────
export async function getSharedTrip(tripId) {
  const res = await fetch(`/api/trips/share/${tripId}`)
  if (!res.ok) throw new Error('Trip not found')
  return res.json()
}
