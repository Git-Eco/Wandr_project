# Wandr — Project Documentation

**Course Submission | Due: May 22, 2026**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Features](#4-features)
5. [AI & Recommendation Engine](#5-ai--recommendation-engine)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)
8. [Frontend Structure](#8-frontend-structure)
9. [Performance Optimizations](#9-performance-optimizations)
10. [Known Limitations](#10-known-limitations)
11. [Future Recommendations](#11-future-recommendations)
12. [Setup & Running Locally](#12-setup--running-locally)

---

## 1. Project Overview

**Wandr** is a full-stack AI-powered travel planning web application. Users can generate personalized multi-day trip itineraries for destinations around the world, manage their travel plans, track budgets, log memories, and share trips publicly.

The project started as a Streamlit prototype and was fully migrated to a production-grade architecture using **FastAPI** (backend) and **React** (frontend), with **Supabase** as the cloud database and authentication provider.

### Core Value Proposition

Traditional travel planning requires hours of research across multiple platforms. Wandr automates the process — a user selects a city, sets preferences and a budget, and the AI engine generates a complete day-by-day itinerary with real locations, estimated costs, weather-aware scheduling, and an interactive map route in seconds.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite | UI framework and build tool |
| Styling | CSS Modules | Scoped component styles |
| Maps | React-Leaflet + OSRM | Interactive maps and route calculation |
| Backend | FastAPI (Python) | REST API server |
| Database | Supabase (PostgreSQL) | Data persistence and authentication |
| Auth | Supabase Auth (JWT) | User registration and session management |
| AI/ML | scikit-learn, NumPy, pandas | Itinerary generation and budget prediction |
| Weather | OpenWeatherMap API | Real-time weather and 5-day forecast |
| Photos | Wikipedia API (Wikimedia Commons) | Place images for recommendations and map popups |
| Deployment | Vercel (frontend) + Render (backend) | Cloud hosting |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     USER BROWSER                        │
│                                                         │
│   React SPA (Vite)                                      │
│   ├── AppContext  (global state: trips, locations)      │
│   ├── Pages       (Dashboard, TripDetails, SharePage)   │
│   ├── Components  (MapView, MemoriesPanel, etc.)        │
│   └── Hooks       (useWikiPhoto)                        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / REST
┌──────────────────────▼──────────────────────────────────┐
│                  FASTAPI BACKEND                         │
│                                                         │
│   Routers                                               │
│   ├── /trips      (CRUD + generate + regenerate)        │
│   ├── /locations  (read-only location database)         │
│   ├── /profile    (user profile management)             │
│   └── /memories   (trip memory CRUD)                    │
│                                                         │
│   Core Modules                                          │
│   ├── itinerary.py  (AI engine + weather)               │
│   └── db.py         (Supabase client + query layer)     │
└──────────────────────┬──────────────────────────────────┘
                       │ Supabase Python Client
┌──────────────────────▼──────────────────────────────────┐
│                    SUPABASE                              │
│   PostgreSQL database                                   │
│   ├── trips          (trip metadata)                    │
│   ├── trip_spots     (individual itinerary stops)       │
│   ├── locations      (810+ curated places, 38 cities)   │
│   ├── memories       (user photos and notes per day)    │
│   └── profiles       (user display name + preferences)  │
└─────────────────────────────────────────────────────────┘
```

### Request Flow — Trip Generation

```
User fills form → POST /trips/generate
  → Rate limit check (15s cooldown per user)
  → Load locations from in-memory cache
  → Fetch weather (with 10-min TTL cache)
  → Run organize_itinerary() in thread pool
      → Filter by city, preferences, weather, budget
      → Score spots with cosine similarity
      → Build day-by-day schedule with proximity routing
      → Inject pinned spot if from recommendation
  → Predict total budget (Linear Regression)
  → Save trip + spots to Supabase
  → Return full trip object to frontend
  → Frontend adds to AppContext state (no re-fetch needed)
```

---

## 4. Features

### Trip Planning
- **AI itinerary generation** — select city, dates, hotel, interests, and budget; the engine builds a complete multi-day schedule
- **Up to 30 days** per trip, 6 time slots per day (Breakfast, Morning, Lunch, Afternoon, Dinner, Evening)
- **38 cities** supported with 810+ curated locations across categories: Sightseeing, Culture, Nature, History, Art, Food, Hotel
- **Budget estimation** — predicted total cost broken down by hotel, activities, and miscellaneous
- **Weather-aware scheduling** — outdoor spots are filtered out on rainy days (configurable)
- **Rest on arrival** — optional Day 1 morning free slot for settling in
- **Exclude visited spots** — for repeat visitors, generates fresh itineraries avoiding previously seen places

### Trip Management
- **Trip status tracking** — Upcoming, Ongoing, Completed (auto-computed from dates)
- **Spot swapping** — replace any individual stop with an alternative from the same city
- **Day re-rolling** — regenerate an entire day's schedule while keeping the rest intact
- **Past day locking** — completed trips and past days of ongoing trips cannot be modified
- **PDF export** — download the full itinerary as a formatted PDF

### Maps
- **Overview map** — all stops across all days plotted on a single map
- **Day map** — per-day route with real road routing via OSRM (Open Source Routing Machine)
- **Orange route line** with shadow depth effect
- **Dotted connectors** from road snap points to actual pin locations
- **Photo popups** — clicking a map pin shows a Wikipedia photo of the place

### Dashboard
- **Welcome card** — context-aware greeting (shows ongoing trip city or countdown to next trip)
- **Mini calendar** — highlights trip dates
- **Upcoming events** — next 4 trips sorted by start date
- **Recommendations** — 8 unvisited spots with Wikipedia photos; clicking opens the trip creator pre-filled with that city and spot
- **Travel heatmap** — choropleth world map showing countries visited
- **Infinite scroll** — trip list loads 9 at a time as user scrolls

### Memories
- **Per-day memory logging** — attach a photo and text note to any day of any trip
- **Notebook-style card design** — image on left, lined paper texture on right
- **Full-size image viewer** — click photo to expand

### Sharing
- **Public share link** — generates a read-only URL for any trip, accessible without login
- **Share page** — clean read-only view of the trip for the recipient

### Settings & Profile
- **Display name and interests** — stored in Supabase profiles table
- **Password change** — via Supabase Auth
- **App theme** — multiple color themes (stored in localStorage)
- **Account deletion** — permanently removes user and all associated data
- **Sign out** — accessible from both desktop settings and mobile navigation

### Mobile Support
- **Responsive layout** — three breakpoints: desktop (3-column), tablet (2-column), mobile (single column + bottom nav)
- **Mobile Details sheet** — slide-up panel with trip info, weather, day budget, day selector, and actions
- **Horizontal day chip scroll** — day numbers scroll horizontally instead of wrapping
- **Tablet info bar** — weather and day budget shown inline in the top bar at tablet width

---

## 5. AI & Recommendation Engine

The itinerary engine lives in `backend/itinerary.py` and uses no external AI API — it runs entirely on the server using classical ML techniques.

### Spot Scoring (Cosine Similarity)

When a user specifies interests (e.g. "History, Art"), the engine scores every candidate spot using **cosine similarity** between the user's preference vector and each spot's category vector.

```
User preferences: [History=1, Art=1, Food=0, Sightseeing=0, ...]
Spot vector:      [History=1, Art=0, Food=0, Sightseeing=0, ...]
Cosine similarity → 0.71 (high match)
```

The top half of scored spots are shuffled and placed before the bottom half, giving preference-aligned spots priority while maintaining variety.

### Proximity Routing

Within each day, the engine picks the next spot by minimizing Euclidean distance from the current location, with a small random jitter (~90 meters) to prevent the same route from being generated every time. This approximates a greedy nearest-neighbor approach without requiring a full TSP solver.

### Budget Prediction (Linear Regression)

Total trip cost is estimated using a `LinearRegression` model trained on three synthetic data points (days-1, days, days+1) to produce a smooth linear extrapolation. While this is mathematically equivalent to a simple formula, it demonstrates the ML pipeline and can be extended to use real historical cost data.

### Pinned Spot Injection

When a user clicks a recommendation card, the selected spot's name is passed as `pinned_spot` to the generation endpoint. The engine resolves the spot from the database and injects it into Day 1 at the appropriate time slot (Lunch for Food spots, Morning or Afternoon for others), guaranteeing it appears in the generated trip.

### Weather Integration

- Current conditions: `GET /data/2.5/weather` — used to filter outdoor spots on rainy days
- 5-day forecast: `GET /data/2.5/forecast` — stored per trip for per-day weather display
- Both are cached in memory with a 10-minute TTL to avoid redundant API calls

---

## 6. Database Schema

All tables are hosted on Supabase (PostgreSQL). Row-level security is enforced via Supabase Auth.

### `trips`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| user_id | uuid (FK) | References auth.users |
| title | text | User-defined trip name |
| city | text | Destination city |
| days | integer | Trip duration |
| cost | numeric | Estimated total cost |
| status | text | Upcoming / Ongoing / Completed |
| start_date | date | Optional trip start |
| end_date | date | Computed from start + days |
| weather_condition | text | Current weather at generation time |
| weather_temp | numeric | Temperature at generation time |
| forecast | jsonb | 5-day forecast dict |
| max_budget | numeric | User's budget cap (nullable) |
| created_at | timestamptz | Auto-set |

### `trip_spots`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| trip_id | uuid (FK) | References trips.id |
| name | text | Place name |
| city | text | City |
| category | text | Hotel / Food / Sightseeing / etc. |
| type | text | Indoor / Outdoor |
| lat | numeric | Latitude |
| lon | numeric | Longitude |
| cost | numeric | Estimated cost |
| day_num | integer | Which day (1-indexed) |
| slot | text | Time slot (Breakfast ☕, Morning 🌅, etc.) |

### `locations`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| name | text | Place name |
| city | text | City |
| category | text | Category |
| type | text | Indoor / Outdoor |
| lat | numeric | Latitude |
| lon | numeric | Longitude |
| cost | numeric | Estimated visit cost (USD) |

810+ rows across 38 cities. Prices verified against 2024/2025 exchange rates. 3–5 hotels per city at different price points.

### `memories`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| trip_id | uuid (FK) | References trips.id |
| user_id | uuid (FK) | References auth.users |
| day_num | integer | Which day the memory belongs to |
| text | text | User's note |
| image_url | text | Supabase Storage URL (nullable) |
| created_at | timestamptz | Auto-set |

### `profiles`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Matches auth.users.id |
| name | text | Display name |
| preferences | text[] | Array of interest categories |

---

## 7. API Reference

All endpoints except `/health` and `/trips/share/{id}` require a Supabase JWT in the `Authorization: Bearer <token>` header.

### Trips

| Method | Endpoint | Description |
|---|---|---|
| GET | `/trips` | List all trips for authenticated user |
| POST | `/trips/generate` | Generate a new AI trip |
| GET | `/trips/{id}` | Get a single trip |
| DELETE | `/trips/{id}` | Delete a trip |
| PATCH | `/trips/{id}/status` | Update trip status |
| PATCH | `/trips/{id}/spots/{spot_id}` | Swap a single spot |
| POST | `/trips/{id}/regenerate-day` | Re-generate one day |
| GET | `/trips/share/{id}` | Public read-only trip (no auth) |

### Other

| Method | Endpoint | Description |
|---|---|---|
| GET | `/locations` | All locations (cached in memory) |
| GET | `/profile` | Get user profile |
| PATCH | `/profile` | Update name and preferences |
| DELETE | `/profile` | Delete account and all data |
| GET | `/memories/{trip_id}/{day_num}` | Get memories for a day |
| POST | `/memories` | Create a memory |
| PATCH | `/memories/{id}` | Update a memory |
| DELETE | `/memories/{id}` | Delete a memory |
| GET | `/health` | Server health check |

### Trip Generation Request Body

```json
{
  "title": "My Paris Trip",
  "city": "Paris",
  "days": 5,
  "start_date": "2026-06-01",
  "chosen_hotel": "Hotel Le Marais",
  "user_preferences": ["History", "Art"],
  "max_budget": 2000,
  "allow_outdoor_rain": false,
  "rest_on_arrival": true,
  "exclude_visited": false,
  "pinned_spot": "Louvre Museum"
}
```

---

## 8. Frontend Structure

```
frontend/src/
├── api/
│   └── client.js          — All API calls, auth headers
├── components/
│   ├── EditSpotModal.jsx   — Spot swap UI
│   ├── MapView.jsx         — OverviewMap + DayMap with OSRM routing
│   ├── MemoriesPanel.jsx   — Memory cards with notebook design
│   ├── ScheduleCard.jsx    — Individual stop card
│   ├── TripCard.jsx        — Trip summary card for dashboard
│   └── TripCreatorModal.jsx — Trip generation form
├── context/
│   ├── AppContext.jsx      — Global state (trips, locations, auth)
│   ├── ThemeContext.jsx    — App theme management
│   └── ToastContext.jsx    — Toast notification system
├── hooks/
│   └── useWikiPhoto.js     — Wikipedia photo fetcher with cache + rate limiting
├── pages/
│   ├── AuthPage.jsx        — Login / signup
│   ├── Dashboard.jsx       — Main dashboard (calendar, recs, heatmap)
│   ├── SharePage.jsx       — Public read-only trip view
│   └── TripDetails.jsx     — Full trip view (overview + day tabs)
└── styles/
    └── global.css          — CSS variables, base styles, utility classes
```

### State Management

Global state is managed through a custom `AppContext` (React Context API) rather than a third-party library. It holds:
- `trips` — all user trips with spots pre-loaded
- `locations` — the full location database (810+ rows)
- `tripsLoaded` — boolean flag for loading states
- `session` / `user` — Supabase auth session

Trips and locations load in parallel on authentication. Trips are shown immediately when ready; locations arrive asynchronously (only needed for recommendations).

---

## 9. Performance Optimizations

The following optimizations were implemented during development:

| Optimization | Where | Impact |
|---|---|---|
| N+1 query fix | `db.get_trips()` | Reduced trip loading from 1+N queries to 2 queries regardless of trip count |
| Locations in-memory cache | `db.get_locations()` | Locations fetched from Supabase once per server lifetime, not per request |
| Weather TTL cache | `itinerary.py` | Same city weather reused for 10 minutes, reducing OpenWeather API calls |
| Thread pool for generation | `trips.py` | Heavy pandas/sklearn work runs off the async event loop, keeping server responsive |
| Backend rate limiting | `trips.py` | 15-second cooldown per user on the generate endpoint |
| Supabase connection warm-up | `main.py` | Connection established on server startup, not on first user request |
| Keep-alive ping | `main.py` | Background task pings Supabase every 4 minutes to prevent idle timeout |
| Parallel data loading | `AppContext.jsx` | Trips and locations load simultaneously; trips shown without waiting for locations |
| TripDetails cache-first | `TripDetails.jsx` | Uses AppContext data directly; only fetches from API if trip not in context |
| Wikipedia photo queue | `useWikiPhoto.js` | Serial request queue with 150ms gap prevents Wikimedia rate limiting |
| Infinite scroll | `Dashboard.jsx` | Trip list renders 9 at a time using IntersectionObserver |

---

## 10. Known Limitations

### Location Database
- **Static dataset** — the 810+ locations are manually curated and stored in a CSV/database. They do not update automatically. New restaurants open, attractions close, and prices change without the app reflecting it.
- **38 cities only** — users cannot plan trips to cities outside the supported list. Adding a new city requires manually researching and entering locations.
- **No real-time availability** — the app cannot check if a restaurant is open, if a museum is closed for renovation, or if a hotel has availability on the requested dates.
- **Cost estimates are approximations** — prices are based on 2024/2025 research and do not reflect seasonal pricing, group discounts, or booking fees.

### AI Engine
- **Greedy proximity routing** — the day planner uses a nearest-neighbor heuristic, not a true optimal route solver. For some cities with spread-out attractions, the route may not be the most efficient.
- **No real personalization learning** — the recommendation engine uses cosine similarity on category preferences set at profile creation. It does not learn from user behavior over time (e.g. which spots they actually visited vs. skipped).
- **Fixed time slots** — every day has exactly 6 slots. The engine cannot account for spots that take a full day, or for users who prefer fewer, longer activities.
- **No transport time awareness** — the route is optimized by distance but does not account for actual travel time between spots (traffic, public transit schedules, etc.).

### Weather
- **Forecast limited to 5 days** — OpenWeatherMap's free tier only provides a 5-day forecast. Trips longer than 5 days show the current weather for all remaining days.
- **City-level granularity** — weather is fetched for the city as a whole, not for specific neighborhoods or elevations.

### Maps
- **OSRM public instance** — the app uses the public OSRM routing server (`router.project-osrm.org`). This is a shared community resource with no SLA. Under heavy load or maintenance, routing may fall back to straight-line connections.
- **Google Maps tiles** — the map tiles are served from Google's tile CDN without an API key. This works for low traffic but may be rate-limited or blocked in production at scale.

### Photos
- **Wikipedia dependency** — place photos are fetched from Wikipedia's API. Not every location has a Wikipedia article, and some articles lack a main image. In those cases, the gradient placeholder is shown.
- **Serial loading** — photos load one at a time (150ms apart) to avoid Wikimedia rate limits. On the recommendations page, all 8 photos take approximately 1–2 seconds to fully load.

### Sharing
- **localhost only in development** — share links use `window.location.origin`, which is `localhost` in development. These links only work on the same machine. Deployment to a public host is required for sharing to work across devices.
- **No expiry or access control** — shared links are permanent and public. There is no way to revoke a share link or set an expiry date.

### Infrastructure
- **Render free tier cold starts** — if the backend is deployed on Render's free tier, it sleeps after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to respond.
- **Single-server architecture** — there is no horizontal scaling, load balancing, or failover. If the backend server goes down, the app is unavailable.
- **In-memory caches are not shared** — weather cache, locations cache, and rate limit state are stored in the server process's memory. If the server restarts or scales to multiple instances, these caches reset.

---

## 11. Future Recommendations

These are features and improvements that would meaningfully extend the project beyond its current scope.

### High Priority

**1. Real booking integration**
Connect to a travel API (Amadeus, Booking.com, Expedia) to show real hotel availability and prices, and allow users to book directly from the app. This would transform Wandr from a planning tool into a complete travel booking platform.

**2. User-generated locations**
Allow users to add custom spots to the database — their favorite local restaurant, a hidden viewpoint, a family home. These would be private to the user but could optionally be shared with the community.

**3. Collaborative trip planning**
Let multiple users plan a trip together in real time. One user creates the trip and invites others via email. All collaborators can vote on spots, add memories, and see each other's changes live (WebSocket-based).

**4. Mobile app (React Native)**
The current app is a responsive web app. A native mobile app would enable push notifications (trip reminders, weather alerts), offline access to saved itineraries, and camera integration for memories without needing to upload from a file picker.

### Medium Priority

**5. Machine learning personalization**
Track which spots users actually visit vs. skip, which trips they complete vs. abandon, and use this behavioral data to improve recommendations over time. A simple collaborative filtering model ("users like you also enjoyed...") would significantly improve suggestion quality.

**6. Dynamic pricing and availability**
Integrate with Google Places API or Foursquare to pull real-time opening hours, current prices, and user ratings. Flag spots that are closed on the user's travel dates.

**7. Multi-city trips**
Allow a single trip to span multiple cities — e.g. Paris for 3 days, then Amsterdam for 2 days. The current architecture supports only one city per trip.

**8. Social features**
Public trip profiles, the ability to "like" or save other users' trips, and a discovery feed of popular itineraries for each city. This would create a community layer on top of the planning tool.

**9. Offline support (PWA)**
Convert the frontend to a Progressive Web App with service workers. Users could download their itinerary before a trip and access it without internet — useful when traveling internationally with limited data.

### Lower Priority

**10. Natural language trip creation**
Instead of filling out a form, users describe their trip in plain text: *"I want a 5-day trip to Tokyo focused on food and anime culture, budget around $1500."* An LLM (GPT-4, Claude) parses the intent and pre-fills the form or generates the trip directly.

**11. Real-time weather alerts**
If the weather forecast changes significantly after a trip is generated (e.g. a storm is now expected on Day 3), notify the user and offer to regenerate that day's outdoor activities with indoor alternatives.

**12. Trip cost tracking**
Allow users to log actual spending during a trip and compare it against the estimated budget. A simple expense tracker per day with a running total vs. estimate.

**13. Database indexes**
Add explicit indexes on `trip_spots(trip_id)`, `trips(user_id)`, and `memories(trip_id)` in Supabase. Supabase auto-indexes primary keys but not foreign keys. At scale, these indexes would significantly speed up the most common queries.

**14. Redis caching layer**
Replace the in-memory Python dicts used for weather and locations caching with Redis. This would allow the cache to persist across server restarts and be shared across multiple server instances if the app scales horizontally.

---

## 12. Setup & Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Supabase project (free tier works)
- An OpenWeatherMap API key (free tier works)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt

# Create backend/.env with:
# SUPABASE_URL=your_supabase_url
# SUPABASE_KEY=your_supabase_anon_key
# OPENWEATHER_API_KEY=your_openweather_key

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Create frontend/.env with:
# VITE_SUPABASE_URL=your_supabase_url
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
# (VITE_API_URL is only needed for production deployment)

npm run dev
```

The app will be available at `http://localhost:5173`.

### Supabase Tables

The following tables must exist in your Supabase project. Create them via the Supabase SQL editor:

```sql
-- Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  preferences text[]
);

-- Locations (populate from locations.csv)
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text, city text, category text, type text,
  lat numeric, lon numeric, cost numeric
);

-- Trips
create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text, city text, days integer, cost numeric,
  status text default 'Upcoming',
  start_date date, end_date date,
  weather_condition text, weather_temp numeric,
  forecast jsonb, max_budget numeric,
  created_at timestamptz default now()
);

-- Trip spots
create table trip_spots (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  name text, city text, category text, type text,
  lat numeric, lon numeric, cost numeric,
  day_num integer, slot text
);

-- Memories
create table memories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  day_num integer, text text, image_url text,
  created_at timestamptz default now()
);
```

---

*Documentation prepared for academic submission — May 2026*
