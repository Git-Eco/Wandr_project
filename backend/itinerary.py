import os
import random
import math
from datetime import date, timedelta, datetime

import numpy as np
import pandas as pd
import requests
from sklearn.linear_model import LinearRegression
from sklearn.metrics.pairwise import cosine_similarity


# ── Weather ───────────────────────────────────────────────────────────────────
WEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "")
_weather_cache: dict[str, tuple] = {}
_WEATHER_TTL = 600  # seconds


def _weather_cached(key: str):
    """Return cached value if still fresh, else None."""
    entry = _weather_cache.get(key)
    if entry and datetime.now().timestamp() < entry[1]:
        return entry[0]
    return None


def _weather_store(key: str, value):
    _weather_cache[key] = (value, datetime.now().timestamp() + _WEATHER_TTL)
    return value


def get_weather_status(city: str) -> tuple[str, float | None]:
    key = f"current:{city.lower()}"
    cached = _weather_cached(key)
    if cached is not None:
        return cached
    try:
        url = (
            f"http://api.openweathermap.org/data/2.5/weather"
            f"?q={city}&appid={WEATHER_API_KEY}&units=metric"
        )
        r = requests.get(url, timeout=5).json()
        if r.get("cod") == 200:
            result = r["weather"][0]["main"], r["main"]["temp"]
            return _weather_store(key, result)
        return "Unknown", None
    except Exception:
        return "Unknown", None


def get_forecast(city: str) -> dict:
    key = f"forecast:{city.lower()}"
    cached = _weather_cached(key)
    if cached is not None:
        return cached
    try:
        url = (
            f"http://api.openweathermap.org/data/2.5/forecast"
            f"?q={city}&appid={WEATHER_API_KEY}&units=metric"
        )
        r = requests.get(url, timeout=5).json()
        if r.get("cod") != "200":
            return {}
        daily = {}
        for item in r["list"]:
            d = item["dt_txt"].split(" ")[0]
            if d not in daily:
                daily[d] = (item["weather"][0]["main"], round(item["main"]["temp"]))
        return _weather_store(key, daily)
    except Exception:
        return {}


# ── Budget ────────────────────────────────────────────────────────────────────
def predict_total_budget(num_days: int, spots: list[dict]) -> float:
    if not spots:
        return 0.0
    df = pd.DataFrame(spots)
    hotel_rows = df[df["category"] == "Hotel"]
    hotel_nightly = hotel_rows["cost"].max() if not hotel_rows.empty else 0
    non_hotel = df[df["category"] != "Hotel"].drop_duplicates(subset=["day_num", "name"])
    activity_sum = non_hotel["cost"].sum()
    daily_base = 40

    days_arr = np.array([[num_days - 1], [num_days], [num_days + 1]])
    costs_arr = np.array([
        hotel_nightly * d + activity_sum + daily_base * d
        for d in [num_days - 1, num_days, num_days + 1]
    ])
    model = LinearRegression().fit(days_arr, costs_arr)
    return round(float(model.predict([[num_days]])[0]), 2)


# ── Status ────────────────────────────────────────────────────────────────────
def compute_status(start_dt, days: int) -> str:
    if not start_dt:
        return "Upcoming"
    if isinstance(start_dt, str):
        start_dt = datetime.strptime(start_dt, "%Y-%m-%d").date()
    today = date.today()
    end_dt = start_dt + timedelta(days=days - 1)
    if today < start_dt:
        return "Upcoming"
    elif today > end_dt:
        return "Completed"
    return "Ongoing"


# ── Recommendation ────────────────────────────────────────────────────────────
def score_spots(spots_df: pd.DataFrame, user_preferences: list[str]) -> pd.DataFrame:
    if spots_df.empty or not user_preferences:
        spots_df = spots_df.copy()
        spots_df["rec_score"] = 1.0
        return spots_df

    all_categories = spots_df["category"].unique().tolist()
    user_vec = np.array([[1 if cat in user_preferences else 0 for cat in all_categories]])
    spot_vecs = np.array([
        [1 if row["category"] == cat else 0 for cat in all_categories]
        for _, row in spots_df.iterrows()
    ])

    if user_vec.sum() == 0 or spot_vecs.sum() == 0:
        scores = np.ones(len(spots_df))
    else:
        scores = cosine_similarity(user_vec, spot_vecs)[0]

    spots_df = spots_df.copy()
    spots_df["rec_score"] = scores
    return spots_df.sort_values("rec_score", ascending=False)


# ── Distance helper ───────────────────────────────────────────────────────────
def _geo_dist(a: dict, b: dict) -> float:
    dlat = a["lat"] - b["lat"]
    dlon = (a["lon"] - b["lon"]) * math.cos(math.radians(a["lat"]))
    return math.sqrt(dlat ** 2 + dlon ** 2)


def _weighted_pick(pool: list[dict], current_loc: dict) -> dict:
    weights = [1.0 / max(_geo_dist(current_loc, s), 0.001) for s in pool]
    return random.choices(pool, weights=weights, k=1)[0]


# ── Itinerary Builder ─────────────────────────────────────────────────────────
def organize_itinerary(
    filtered_df: pd.DataFrame,
    days: int,
    target_city: str,
    full_database: pd.DataFrame,
    rest_mode: bool,
    previously_used: set | None = None,
    exclude_visited: bool = False,
    chosen_hotel: str | None = None,
    user_preferences: list[str] | None = None,
    pinned_spot: str | None = None,
) -> list[dict]:
    if previously_used is None:
        previously_used = set()

    # ── Resolve pinned spot ───────────────────────────────────────────────────
    pinned_row: dict | None = None
    if pinned_spot:
        pin_match = full_database[
            (full_database["city"] == target_city) & (full_database["name"] == pinned_spot)
        ]
        if not pin_match.empty:
            pinned_row = pin_match.iloc[0].to_dict()

    # ── Resolve hotel ─────────────────────────────────────────────────────────
    hotel_pool = full_database[
        (full_database["city"] == target_city) & (full_database["category"] == "Hotel")
    ]
    if chosen_hotel:
        hotel_row = hotel_pool[hotel_pool["name"] == chosen_hotel]
        hotel = hotel_row.iloc[0].to_dict() if not hotel_row.empty else hotel_pool.iloc[0].to_dict()
    elif not hotel_pool.empty:
        hotel = hotel_pool.iloc[0].to_dict()
    else:
        hotel = {
            "name": "Central Hotel",
            "lat": full_database[full_database["city"] == target_city]["lat"].mean(),
            "lon": full_database[full_database["city"] == target_city]["lon"].mean(),
            "category": "Hotel",
            "cost": 0,
        }

    # ── Zone filtering  ──────────────────
    city_db = full_database[full_database["city"] == target_city].copy()
    if "zone" in city_db.columns:
        hotel_zone_rows = city_db[city_db["name"] == hotel["name"]]["zone"].values
        hotel_zone = hotel_zone_rows[0] if len(hotel_zone_rows) else None
        if hotel_zone and hotel_zone not in (None, "isolated"):
            zone_mask = (city_db["zone"] == hotel_zone) | (city_db["category"] == "Hotel")
            city_db = city_db[zone_mask]

    # ── Build pools ───────────────────────────────────────────────────────────
    food_pool = city_db[city_db["category"] == "Food"].to_dict("records")

    full_sight_pool = city_db[
        (city_db["category"] != "Food") & (city_db["category"] != "Hotel")
    ].to_dict("records")

    zone_names = set(city_db["name"].tolist())
    sight_pool = filtered_df[
        (filtered_df["category"] != "Food")
        & (filtered_df["category"] != "Hotel")
        & (filtered_df["name"].isin(zone_names))
    ].to_dict("records")

    # ── Previously-visited filtering ──────────────────────────────────────────
    def filter_pool(pool: list[dict]) -> list[dict]:
        if exclude_visited:
            fresh = [s for s in pool if s["name"] not in previously_used]
            return fresh if fresh else pool
        fresh = [s for s in pool if s["name"] not in previously_used]
        seen  = [s for s in pool if s["name"] in previously_used]
        random.shuffle(fresh)
        random.shuffle(seen)
        return fresh + seen

    sight_pool      = filter_pool(sight_pool)
    full_sight_pool = filter_pool(full_sight_pool)
    food_pool       = filter_pool(food_pool)

    if user_preferences and sight_pool:
        sight_df = pd.DataFrame(sight_pool)
        sight_df = score_spots(sight_df, user_preferences)
        mid    = max(1, len(sight_df) // 2)
        top    = sight_df.iloc[:mid].to_dict("records")
        bottom = sight_df.iloc[mid:].to_dict("records")
        random.shuffle(top)
        random.shuffle(bottom)
        sight_pool = top + bottom
    else:
        random.shuffle(sight_pool)

    random.shuffle(food_pool)

    # ── State ─────────────────────────────────────────────────────────────────
    used_sightseeing_names: set = set()
    used_food_names: set        = set()
    all_sight_names             = {s["name"] for s in full_sight_pool}
    slots = ["Breakfast ☕", "Morning 🌅", "Lunch 🍔", "Afternoon ☀️", "Dinner 🍷", "Evening 🌙"]
    final_itinerary: list[dict] = []
    recent_sightseeing: list    = []  # rolling window of last 4 picks

    # ── Pinned slot resolution ────────────────────────────────────────────────
    pinned_slot: str | None = None
    if pinned_row:
        cat = pinned_row.get("category", "")
        if cat == "Food":
            pinned_slot = "Lunch 🍔"
        elif rest_mode:
            pinned_slot = "Afternoon ☀️"
        else:
            pinned_slot = "Morning 🌅"

    # ── Day loop ──────────────────────────────────────────────────────────────
    for d in range(1, days + 1):
        if d == 1:
            current_loc = hotel
        else:
            nearby_anchors = [
                s for s in full_sight_pool
                if _geo_dist(hotel, s) < 0.09  # ~10 km
            ]
            current_loc = random.choice(nearby_anchors) if nearby_anchors else hotel

        used_today: set = set()

        for slot in slots:

            # ── Pinned spot injection (Day 1 only) ────────────────────────────
            if d == 1 and pinned_row and slot == pinned_slot:
                chosen = pinned_row.copy()
                chosen["day_num"] = d
                chosen["slot"]    = slot
                final_itinerary.append(chosen)
                current_loc = chosen
                if pinned_row.get("category") == "Food":
                    used_food_names.add(chosen["name"])
                else:
                    used_sightseeing_names.add(chosen["name"])
                    recent_sightseeing.append(chosen["name"])
                used_today.add(chosen["name"])
                continue

            # ── Breakfast — always at hotel ───────────────────────────────────
            if "Breakfast" in slot:
                chosen = hotel.copy()

            # ── Rest mode — stay at hotel on Day 1 morning ────────────────────
            elif "Morning" in slot and d == 1 and rest_mode:
                chosen = hotel.copy()
                chosen["name"] = f"{hotel['name']} (Rest & Settle)"
                chosen["cost"] = 0

            # ── Food slots ────────────────────────────────────────────────────
            elif "Lunch" in slot or "Dinner" in slot:
                pool = [
                    f for f in food_pool
                    if f["name"] not in used_food_names and f["name"] not in used_today
                ]
                if not pool:
                    pool = [f for f in food_pool if f["name"] not in used_today]
                if not pool:
                    # Full reset — all food spots have been visited; start over
                    used_food_names.clear()
                    pool = [f for f in food_pool if f["name"] not in used_today]
                    random.shuffle(pool)

                chosen = _weighted_pick(pool, current_loc).copy()
                used_food_names.add(chosen["name"])
                used_today.add(chosen["name"])

            # ── Sightseeing slots (Morning / Afternoon / Evening) ─────────────
            else:
                # Full reset when all sights have been used
                if all_sight_names.issubset(used_sightseeing_names):
                    used_sightseeing_names.clear()
                    recent_sightseeing.clear()

                is_evening = "Evening" in slot

                def slot_ok(s: dict) -> bool:
                    """Evening slots exclude outdoor/daytime-only categories."""
                    if is_evening and s.get("category", "") in ("Nature", "History", "Art"):
                        return False
                    return True

                pool = [
                    s for s in sight_pool
                    if s["name"] not in used_today
                    and s["name"] not in recent_sightseeing
                    and s["name"] not in used_sightseeing_names
                    and slot_ok(s)
                ]
                if not pool:
                    pool = [
                        s for s in sight_pool
                        if s["name"] not in used_today
                        and s["name"] not in used_sightseeing_names
                        and slot_ok(s)
                    ]
                if not pool:
                    pool = [
                        s for s in full_sight_pool
                        if s["name"] not in used_today
                        and s["name"] not in recent_sightseeing
                        and s["name"] not in used_sightseeing_names
                        and slot_ok(s)
                    ]
                if not pool:
                    pool = [
                        s for s in full_sight_pool
                        if s["name"] not in used_today
                        and s["name"] not in used_sightseeing_names
                        and slot_ok(s)
                    ]
                if not pool:
                    # Last resort: allow repeats but avoid same-day duplicates
                    pool = [s for s in full_sight_pool if s["name"] not in used_today]
                    random.shuffle(pool)
                if not pool:
                    pool = [hotel]

                chosen = _weighted_pick(pool, current_loc).copy()
                used_sightseeing_names.add(chosen["name"])
                used_today.add(chosen["name"])
                recent_sightseeing.append(chosen["name"])
                if len(recent_sightseeing) > 4:
                    recent_sightseeing.pop(0)

            chosen["day_num"] = d
            chosen["slot"]    = slot
            final_itinerary.append(chosen)
            current_loc = chosen

    return final_itinerary
