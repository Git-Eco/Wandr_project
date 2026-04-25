from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import date
from typing import Optional
import pandas as pd

import db
import itinerary as itin
from dependencies import get_current_user_id

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class GenerateTripRequest(BaseModel):
    title: str
    city: str
    days: int
    start_date: Optional[date] = None
    chosen_hotel: Optional[str] = None
    user_preferences: Optional[list[str]] = []
    max_budget: Optional[float] = 0
    allow_outdoor_rain: bool = False
    rest_on_arrival: bool = True
    exclude_visited: bool = False

class UpdateStatusRequest(BaseModel):
    status: str

class SwapSpotRequest(BaseModel):
    new_name: str
    new_category: str
    new_type: str
    new_lat: float
    new_lon: float
    new_cost: float

class RegenerateDayRequest(BaseModel):
    day_num: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verify_owner(trip_id: str, user_id: str):
    client = db.get_client()
    res = client.table("trips").select("id").eq("id", trip_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=403, detail="Trip not found or access denied.")


# ── Auth-required routes ──────────────────────────────────────────────────────

@router.get("")
def list_trips(user_id: str = Depends(get_current_user_id)):
    return db.get_trips(user_id)


@router.post("/generate")
def generate_trip(body: GenerateTripRequest, user_id: str = Depends(get_current_user_id)):
    df = db.get_locations()
    if df.empty:
        raise HTTPException(status_code=500, detail="Location database is empty.")

    cond, temp = itin.get_weather_status(body.city)
    forecast   = itin.get_forecast(body.city)

    filtered = df[df["city"] == body.city].copy()
    if body.user_preferences:
        filtered = filtered[filtered["category"].isin(body.user_preferences + ["Hotel"])]
    if cond in ["Rain", "Drizzle", "Thunderstorm"] and not body.allow_outdoor_rain:
        filtered = filtered[filtered["type"] == "Indoor"]

    if body.max_budget and body.max_budget > 0:
        if body.chosen_hotel:
            rows = df[df["name"] == body.chosen_hotel]["cost"].values
            hotel_nightly = rows[0] if len(rows) > 0 else 0
        else:
            pool = df[(df["city"] == body.city) & (df["category"] == "Hotel")]
            hotel_nightly = pool["cost"].min() if not pool.empty else 0

        activity_budget = body.max_budget - hotel_nightly * body.days - 40 * body.days
        if activity_budget < 0:
            cheapest = df[(df["city"] == body.city) & (df["category"] == "Hotel")].nsmallest(1, "cost")
            if not cheapest.empty:
                raise HTTPException(status_code=400,
                    detail=f"Budget of ${body.max_budget} doesn't cover the hotel alone. "
                           f"Consider '{cheapest.iloc[0]['name']}' at ${int(cheapest.iloc[0]['cost'])}/night.")
        non_hotel_mask = filtered["category"] != "Hotel"
        filtered_activities = filtered[non_hotel_mask].sort_values("cost")
        filtered_activities = filtered_activities[
            filtered_activities["cost"] <= max(activity_budget / max(body.days, 1), 0)
        ]
        filtered = pd.concat([filtered[~non_hotel_mask], filtered_activities])

    all_trips = db.get_trips(user_id)
    previously_used = set()
    for t in all_trips:
        if t["city"] == body.city:
            for spot in t["spots"]:
                previously_used.add(spot["name"])

    spots = itin.organize_itinerary(
        filtered_df=filtered, days=body.days, target_city=body.city,
        full_database=df, rest_mode=body.rest_on_arrival,
        previously_used=previously_used, exclude_visited=body.exclude_visited,
        chosen_hotel=body.chosen_hotel, user_preferences=body.user_preferences or [],
    )

    cost     = itin.predict_total_budget(body.days, spots)
    end_date = (body.start_date + __import__("datetime").timedelta(days=body.days - 1)) if body.start_date else None
    status   = itin.compute_status(body.start_date, body.days)

    trip = {
        "title": body.title.strip() or f"Trip to {body.city}",
        "city": body.city, "days": body.days, "cost": cost, "status": status,
        "start_date": body.start_date, "end_date": end_date,
        "weather": {"condition": cond, "temp": temp}, "forecast": forecast, "spots": spots,
        "max_budget": body.max_budget if body.max_budget and body.max_budget > 0 else None,
    }
    trip_id    = db.save_trip(user_id, trip)
    trip["id"] = trip_id

    over_budget = body.max_budget and body.max_budget > 0 and cost > body.max_budget
    return {**trip, "over_budget": bool(over_budget),
            "over_by": round(cost - body.max_budget, 2) if over_budget else 0.0}


@router.get("/{trip_id}")
def get_trip(trip_id: str, user_id: str = Depends(get_current_user_id)):
    all_trips = db.get_trips(user_id)
    trip = next((t for t in all_trips if t["id"] == trip_id), None)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return trip


@router.delete("/{trip_id}")
def delete_trip(trip_id: str, user_id: str = Depends(get_current_user_id)):
    _verify_owner(trip_id, user_id)
    db.delete_trip(trip_id)
    return {"deleted": trip_id}


@router.patch("/{trip_id}/status")
def update_status(trip_id: str, body: UpdateStatusRequest,
                  user_id: str = Depends(get_current_user_id)):
    _verify_owner(trip_id, user_id)
    db.update_trip_status(trip_id, body.status)
    return {"trip_id": trip_id, "status": body.status}


# ── Spot swap ─────────────────────────────────────────────────────────────────

@router.patch("/{trip_id}/spots/{spot_id}")
def swap_spot(trip_id: str, spot_id: str, body: SwapSpotRequest,
              user_id: str = Depends(get_current_user_id)):
    """Replace a single spot with a different location."""
    _verify_owner(trip_id, user_id)
    client = db.get_client()

    spot_res = client.table("trip_spots").select("*").eq("id", spot_id).execute()
    if not spot_res.data:
        raise HTTPException(status_code=404, detail="Spot not found.")
    spot = spot_res.data[0]
    if spot["trip_id"] != trip_id:
        raise HTTPException(status_code=403, detail="Spot does not belong to this trip.")

    updates = {
        "name":     body.new_name,
        "category": body.new_category,
        "type":     body.new_type,
        "lat":      body.new_lat,
        "lon":      body.new_lon,
        "cost":     body.new_cost,
    }
    res = client.table("trip_spots").update(updates).eq("id", spot_id).execute()

    # Recalculate trip total cost
    trip_res = client.table("trips").select("days").eq("id", trip_id).execute()
    all_spots_res = client.table("trip_spots").select("*").eq("trip_id", trip_id).execute()
    all_spots = all_spots_res.data or []
    if trip_res.data and all_spots:
        new_cost = itin.predict_total_budget(trip_res.data[0]["days"], all_spots)
        client.table("trips").update({"cost": new_cost}).eq("id", trip_id).execute()

    return res.data[0] if res.data else {}


# ── Regenerate a single day ───────────────────────────────────────────────────

@router.post("/{trip_id}/regenerate-day")
def regenerate_day(trip_id: str, body: RegenerateDayRequest,
                   user_id: str = Depends(get_current_user_id)):
    """Delete and re-generate spots for one day."""
    _verify_owner(trip_id, user_id)
    client = db.get_client()

    trip_res = client.table("trips").select("*").eq("id", trip_id).execute()
    if not trip_res.data:
        raise HTTPException(status_code=404, detail="Trip not found.")
    trip = trip_res.data[0]

    # Spots on OTHER days — preserve these and use as exclusion set
    other_res = client.table("trip_spots").select("*") \
        .eq("trip_id", trip_id).neq("day_num", body.day_num).execute()
    other_spots = other_res.data or []
    previously_used = {s["name"] for s in other_spots}

    # Delete only this day
    client.table("trip_spots").delete() \
        .eq("trip_id", trip_id).eq("day_num", body.day_num).execute()

    df = db.get_locations()
    if df.empty:
        raise HTTPException(status_code=500, detail="Location database is empty.")

    city = trip["city"]
    filtered = df[df["city"] == city].copy()

    # Reuse the same hotel as the rest of the trip
    hotel_spot = next((s for s in other_spots if s["category"] == "Hotel"), None)
    chosen_hotel = hotel_spot["name"] if hotel_spot else None

    new_spots = itin.organize_itinerary(
        filtered_df=filtered, days=1, target_city=city,
        full_database=df, rest_mode=False,
        previously_used=previously_used, exclude_visited=True,
        chosen_hotel=chosen_hotel, user_preferences=[],
    )

    # Stamp with the correct day number
    for s in new_spots:
        s["day_num"] = body.day_num

    rows = [{
        "trip_id":  trip_id,
        "name":     s["name"],
        "city":     s.get("city", city),
        "category": s["category"],
        "type":     s.get("type", ""),
        "lat":      float(s["lat"]),
        "lon":      float(s["lon"]),
        "cost":     float(s["cost"]),
        "day_num":  int(s["day_num"]),
        "slot":     str(s["slot"]),
    } for s in new_spots]

    new_spots_with_ids = []
    if rows:
        inserted = client.table("trip_spots").insert(rows).execute()
        new_spots_with_ids = inserted.data or []

    # Recalculate total cost
    all_spots = other_spots + new_spots_with_ids
    new_cost = itin.predict_total_budget(trip["days"], all_spots)
    client.table("trips").update({"cost": new_cost}).eq("id", trip_id).execute()

    return {"day_num": body.day_num, "new_spots": new_spots_with_ids, "new_cost": new_cost}


# ── Public share (no auth required) ──────────────────────────────────────────

@router.get("/share/{trip_id}")
def get_shared_trip(trip_id: str):
    """Read-only public endpoint — no authentication required."""
    client = db.get_client()

    trip_res = client.table("trips").select("*").eq("id", trip_id).execute()
    if not trip_res.data:
        raise HTTPException(status_code=404, detail="Trip not found.")
    t = trip_res.data[0]

    spots_res = client.table("trip_spots").select("*") \
        .eq("trip_id", trip_id).order("day_num").execute()

    slot_order = ["Breakfast ☕","Morning 🌅","Lunch 🍔","Afternoon ☀️","Dinner 🍷","Evening 🌙"]
    spots = sorted(spots_res.data or [],
        key=lambda s: (s["day_num"], slot_order.index(s["slot"]) if s["slot"] in slot_order else 99))

    return {
        "id":         t["id"],
        "title":      t["title"],
        "city":       t["city"],
        "days":       t["days"],
        "cost":       t["cost"],
        "status":     t.get("status", "Upcoming"),
        "start_date": t.get("start_date"),
        "end_date":   t.get("end_date"),
        "weather":    {"condition": t["weather_condition"], "temp": t["weather_temp"]},
        "forecast":   t.get("forecast") or {},
        "spots":      spots,
    }
