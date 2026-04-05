import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client = None

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

def get_session():
    return get_client().auth.get_session()

def get_user():
    session = get_session()
    return session.user if session else None


# ── Locations ─────────────────────────────────────────────────────────────────

def get_locations() -> pd.DataFrame:
    """Fetch all locations from Supabase and return as a DataFrame."""
    res = get_client().table("locations").select("*").execute()
    if res.data:
        return pd.DataFrame(res.data)
    return pd.DataFrame()


# ── Trips ─────────────────────────────────────────────────────────────────────

def get_trips(user_id: str) -> list[dict]:
    """Fetch all trips for a user, with their spots joined."""
    trips_res = get_client().table("trips").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    if not trips_res.data:
        return []

    trips = []
    for t in trips_res.data:
        spots_res = get_client().table("trip_spots").select("*").eq("trip_id", t["id"]).order("day_num").execute()
        spots_df = pd.DataFrame(spots_res.data) if spots_res.data else pd.DataFrame()

        # Restore slot ordering
        if not spots_df.empty:
            slot_order = ["Breakfast ☕", "Morning 🌅", "Lunch 🍔", "Afternoon ☀️", "Dinner 🍷", "Evening 🌙"]
            spots_df['slot'] = pd.Categorical(spots_df['slot'], categories=slot_order, ordered=True)
            spots_df = spots_df.sort_values(by=['day_num', 'slot']).reset_index(drop=True)

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
            "plan_df": spots_df,
        })
    return trips


def save_trip(user_id: str, trip: dict) -> str:
    """Insert a trip and its spots. Returns the new trip id."""
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

    # Insert spots
    plan_df = trip["plan_df"]
    if not plan_df.empty:
        spots = []
        for _, row in plan_df.iterrows():
            spots.append({
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
        get_client().table("trip_spots").insert(spots).execute()

    return trip_id


def delete_trip(trip_id: str):
    """Delete a trip (spots cascade via FK)."""
    get_client().table("trips").delete().eq("id", trip_id).execute()


def update_trip_status(trip_id: str, status: str):
    get_client().table("trips").update({"status": status}).eq("id", trip_id).execute()
