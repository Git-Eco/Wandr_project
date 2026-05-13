import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client = None
_locations_cache: pd.DataFrame | None = None  # module-level cache — locations never change


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        _client = create_client(url, key)
    return _client


# ── Auth ──────────────────────────────────────────────────────────────────────

def sign_up(email: str, password: str):
    return get_client().auth.sign_up({"email": email, "password": password})

def sign_in(email: str, password: str):
    return get_client().auth.sign_in_with_password({"email": email, "password": password})

def sign_out():
    get_client().auth.sign_out()

def get_user_from_token(token: str):
    """Verify a Supabase JWT and return the user object."""
    return get_client().auth.get_user(token)


# ── Locations ─────────────────────────────────────────────────────────────────

def get_locations() -> pd.DataFrame:
    """Return locations DataFrame, fetching from Supabase only on first call."""
    global _locations_cache
    if _locations_cache is not None and not _locations_cache.empty:
        return _locations_cache
    res = get_client().table("locations").select("*").execute()
    if res.data:
        _locations_cache = pd.DataFrame(res.data)
        return _locations_cache
    return pd.DataFrame()


# ── Trips ─────────────────────────────────────────────────────────────────────

def get_trips(user_id: str) -> list[dict]:
    """
    Load all trips for a user in 2 queries instead of 1 + N.
    Query 1: fetch all trips for the user.
    Query 2: fetch ALL spots for those trips in one go, then group in Python.
    """
    trips_res = (
        get_client().table("trips")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    if not trips_res.data:
        return []

    trip_ids = [t["id"] for t in trips_res.data]

    # Single query for all spots across all trips
    spots_res = (
        get_client().table("trip_spots")
        .select("*")
        .in_("trip_id", trip_ids)
        .execute()
    )
    all_spots = spots_res.data or []

    # Group spots by trip_id in Python
    slot_order = ["Breakfast ☕", "Morning 🌅", "Lunch 🍔", "Afternoon ☀️", "Dinner 🍷", "Evening 🌙"]
    slot_rank  = {s: i for i, s in enumerate(slot_order)}

    spots_by_trip: dict[str, list] = {tid: [] for tid in trip_ids}
    for spot in all_spots:
        tid = spot.get("trip_id")
        if tid in spots_by_trip:
            spots_by_trip[tid].append(spot)

    # Sort each trip's spots by day_num then slot order
    for tid in spots_by_trip:
        spots_by_trip[tid].sort(
            key=lambda s: (s.get("day_num", 0), slot_rank.get(s.get("slot", ""), 99))
        )

    trips = []
    for t in trips_res.data:
        trips.append({
            "id": t["id"],
            "title": t["title"],
            "city": t["city"],
            "days": t["days"],
            "cost": t["cost"],
            "status": t.get("status", "Upcoming"),
            "start_date": t.get("start_date"),
            "end_date": t.get("end_date"),
            "weather": {"condition": t["weather_condition"], "temp": t["weather_temp"]},
            "forecast": t.get("forecast") or {},
            "spots": spots_by_trip.get(t["id"], []),
        })
    return trips


def save_trip(user_id: str, trip: dict) -> str:
    from datetime import date as date_type
    def to_str(d):
        if d is None: return None
        if isinstance(d, date_type): return d.isoformat()
        return str(d)

    trip_row = {
        "user_id": user_id,
        "title": trip["title"],
        "city": trip["city"],
        "days": trip["days"],
        "cost": trip["cost"],
        "status": trip.get("status", "Upcoming"),
        "start_date": to_str(trip.get("start_date")),
        "end_date": to_str(trip.get("end_date")),
        "weather_condition": trip["weather"]["condition"],
        "weather_temp": trip["weather"]["temp"],
        "forecast": trip.get("forecast", {}),
    }
    res = get_client().table("trips").insert(trip_row).execute()
    trip_id = res.data[0]["id"]

    spots = trip.get("spots", [])
    if spots:
        rows = []
        for row in spots:
            rows.append({
                "trip_id": trip_id,
                "name": row["name"],
                "city": row.get("city", trip["city"]),
                "category": row["category"],
                "type": row.get("type", ""),
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "cost": float(row["cost"]),
                "day_num": int(row["day_num"]),
                "slot": str(row["slot"]),
            })
        get_client().table("trip_spots").insert(rows).execute()

    return trip_id


def delete_trip(trip_id: str):
    get_client().table("trips").delete().eq("id", trip_id).execute()


def update_trip_status(trip_id: str, status: str):
    get_client().table("trips").update({"status": status}).eq("id", trip_id).execute()
