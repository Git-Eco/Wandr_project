/**
 * useWikiPhoto(name, city?)
 *
 * Fetches a Wikipedia thumbnail for a place name using a single API call:
 *   action=query&generator=search&prop=pageimages
 *
 * Key design decisions:
 * - Single request per spot (no multi-step chaining that causes rate limits)
 * - Proper User-Agent header (required by Wikimedia for non-browser clients)
 * - Serial request queue with 150ms gap — prevents 429 bursts when many
 *   cards mount at the same time
 * - Module-level cache so each name is only fetched once per session
 *
 * Returns: { url: string|null, loading: boolean }
 */

import { useState, useEffect } from 'react'

const cache   = new Map()   // cacheKey → url | null
const pending = new Map()   // cacheKey → Promise<url|null>

// ── Serial queue ──────────────────────────────────────────────────────────────
// Wikimedia rate-limits burst traffic. We process one request at a time
// with a small delay between each to stay well under the limit.
let queueTail = Promise.resolve()

function enqueue(fn) {
  const result = queueTail.then(() => fn())
  // Always advance the tail, even if fn() throws
  queueTail = result.then(
    () => delay(150),
    () => delay(150),
  )
  return result
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
const UA = 'Wandr-App/1.0 (travel-planner; educational project)'

async function fetchWikiPhoto(name, city) {
  // Append city for disambiguation — "Senso-ji Temple Tokyo" finds the right article
  const query = city ? `${name} ${city}` : name

  const url =
    `https://en.wikipedia.org/w/api.php` +
    `?action=query` +
    `&generator=search` +
    `&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrlimit=2` +           // top 2 results in case first has no image
    `&prop=pageimages` +
    `&pithumbsize=600` +
    `&format=json` +
    `&origin=*`               // CORS

  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
  })

  if (!res.ok) return null

  const data = await res.json()
  const pages = Object.values(data?.query?.pages ?? {})

  // Sort by search index so we try the best match first
  pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99))

  for (const page of pages) {
    if (page?.thumbnail?.source) return page.thumbnail.source
  }

  return null
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useWikiPhoto(name, city) {
  const key = city ? `${name}||${city}` : name

  const [url, setUrl]         = useState(() => cache.has(key) ? cache.get(key) : undefined)
  const [loading, setLoading] = useState(!cache.has(key))

  useEffect(() => {
    if (!name) { setUrl(null); setLoading(false); return }

    if (cache.has(key)) {
      setUrl(cache.get(key))
      setLoading(false)
      return
    }

    if (!pending.has(key)) {
      // Enqueue so requests go out serially, not all at once
      pending.set(key,
        enqueue(() => fetchWikiPhoto(name, city))
          .then(result => { cache.set(key, result); pending.delete(key); return result })
          .catch(()    => { cache.set(key, null);   pending.delete(key); return null  })
      )
    }

    setLoading(true)
    pending.get(key).then(result => {
      setUrl(result)
      setLoading(false)
    })
  }, [key])

  return { url: url ?? null, loading }
}
