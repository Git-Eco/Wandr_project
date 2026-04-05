import streamlit as st
import pandas as pd
import numpy as np
import folium
from streamlit_folium import st_folium
import requests
from sklearn.linear_model import LinearRegression
import random
import time
from datetime import date, timedelta, datetime

import db
import auth
from components import (
    weather_icon, render_hero, render_trip_hero, render_trip_card,
    render_budget_boxes, render_info_strips, render_schedule_card,
    render_map_legend, render_section_title, make_map_marker
)

def get_weather_status(city, api_key):
    try:
        url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}&units=metric"
        r = requests.get(url).json()
        if r.get("cod") == 200:
            return r["weather"][0]["main"], r["main"]["temp"]
        return "Unknown", None
    except:
        return "Unknown", None

def get_forecast(city, api_key):
    try:
        url = f"http://api.openweathermap.org/data/2.5/forecast?q={city}&appid={api_key}&units=metric"
        r = requests.get(url).json()
        if r.get("cod") != "200":
            return {}
        daily = {}
        for item in r["list"]:
            d = item["dt_txt"].split(" ")[0]
            if d not in daily:
                daily[d] = (item["weather"][0]["main"], round(item["main"]["temp"]))
        return daily
    except:
        return {}

def predict_total_budget(num_days, selected_activities_df):
    if selected_activities_df.empty:
        return 0
    temp_df = selected_activities_df.copy()
    hotel_rows = temp_df[temp_df['category'] == 'Hotel']
    hotel_nightly = hotel_rows['cost'].max() if not hotel_rows.empty else 0
    non_hotel = temp_df[temp_df['category'] != 'Hotel'].drop_duplicates(subset=['day_num', 'name'])
    activity_sum = non_hotel['cost'].sum()
    daily_base = 40
    days_arr = np.array([[num_days-1], [num_days], [num_days+1]])
    costs_arr = np.array([(hotel_nightly * d + activity_sum + daily_base * d) for d in [num_days-1, num_days, num_days+1]])
    model = LinearRegression().fit(days_arr, costs_arr)
    return round(float(model.predict([[num_days]])[0]), 2)

def compute_status(start_dt, days):
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

def organize_itinerary(filtered_df, days, target_city, full_database, rest_mode,
                       previously_used=None, exclude_visited=False, chosen_hotel=None):
    if previously_used is None:
        previously_used = set()
    hotel_pool = full_database[(full_database['city'] == target_city) & (full_database['category'] == 'Hotel')]
    if chosen_hotel:
        hotel_row = hotel_pool[hotel_pool['name'] == chosen_hotel]
        hotel = hotel_row.iloc[0].to_dict() if not hotel_row.empty else hotel_pool.iloc[0].to_dict()
    elif not hotel_pool.empty:
        hotel = hotel_pool.iloc[0].to_dict()
    else:
        hotel = {"name": "Central Hotel",
                 "lat": full_database[full_database['city'] == target_city]['lat'].mean(),
                 "lon": full_database[full_database['city'] == target_city]['lon'].mean(),
                 "category": "Hotel", "cost": 0}
    food_pool = full_database[(full_database['city'] == target_city) & (full_database['category'] == 'Food')].to_dict('records')
    sight_pool = filtered_df[(filtered_df['category'] != 'Food') & (filtered_df['category'] != 'Hotel')].to_dict('records')

    def filter_pool(pool):
        if exclude_visited:
            fresh = [s for s in pool if s['name'] not in previously_used]
            return fresh if fresh else pool
        fresh = [s for s in pool if s['name'] not in previously_used]
        seen  = [s for s in pool if s['name'] in previously_used]
        random.shuffle(fresh); random.shuffle(seen)
        return fresh + seen

    sight_pool = filter_pool(sight_pool)
    food_pool  = filter_pool(food_pool)
    random.shuffle(sight_pool); random.shuffle(food_pool)
    used_sightseeing, used_food, final_itinerary = [], [], []
    slots = ["Breakfast ☕", "Morning 🌅", "Lunch 🍔", "Afternoon ☀️", "Dinner 🍷", "Evening 🌙"]

    for d in range(1, days + 1):
        current_loc = hotel
        for slot in slots:
            if "Morning" in slot and d == 1 and rest_mode:
                chosen = hotel.copy(); chosen['name'] = f"{hotel['name']} (Rest & Settle)"; chosen['cost'] = 0
            elif "Breakfast" in slot:
                chosen = hotel.copy()
            elif "Lunch" in slot or "Dinner" in slot:
                pool = [f for f in food_pool if f['name'] not in used_food]
                if not pool:
                    used_food.clear(); pool = list(food_pool); random.shuffle(pool)
                best_idx, min_dist = 0, float('inf')
                for i, s in enumerate(pool):
                    dist = (((current_loc['lat']-s['lat'])**2+(current_loc['lon']-s['lon'])**2)**0.5)+random.uniform(0,0.005)
                    if dist < min_dist: min_dist, best_idx = dist, i
                chosen = pool.pop(best_idx).copy() if pool else hotel.copy()
                used_food.append(chosen['name'])
            else:
                pool = [s for s in sight_pool if s['name'] not in used_sightseeing and s['name'] != hotel['name']]
                if not pool:
                    used_sightseeing.clear()
                    pool = [s for s in sight_pool if s['name'] != hotel['name']]
                    random.shuffle(pool)
                    if not pool: pool = [hotel]
                best_idx, min_dist = 0, float('inf')
                for i, s in enumerate(pool):
                    dist = (((current_loc['lat']-s['lat'])**2+(current_loc['lon']-s['lon'])**2)**0.5)+random.uniform(0,0.005)
                    if dist < min_dist: min_dist, best_idx = dist, i
                chosen = pool.pop(best_idx).copy()
                used_sightseeing.append(chosen['name'])
            chosen['day_num'] = d; chosen['slot'] = slot
            final_itinerary.append(chosen); current_loc = chosen

    df_result = pd.DataFrame(final_itinerary)
    df_result['slot'] = pd.Categorical(df_result['slot'], categories=slots, ordered=True)
    return df_result.sort_values(by=['day_num', 'slot']).reset_index(drop=True)

st.set_page_config(page_title="Wandr", page_icon="✈️", layout="wide")
st.markdown('<meta name="viewport" content="width=device-width, initial-scale=1.0">', unsafe_allow_html=True)

if 'view' not in st.session_state: st.session_state.view = "dashboard"
if 'selected_trip_index' not in st.session_state: st.session_state.selected_trip_index = None

with open("style.css", encoding="utf-8") as f:
    st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)

if not auth.is_authenticated():
    auth.show_auth()
    st.stop()

user_id = auth.get_user_id()

@st.cache_data(ttl=3600)
def load_data():
    try:
        result = db.get_locations()
        if not result.empty and 'city' in result.columns:
            return result
    except Exception:
        pass
    return pd.read_csv("locations.csv")

df = load_data()

def refresh_trips():
    st.session_state.all_trips = db.get_trips(user_id)

if 'all_trips' not in st.session_state:
    refresh_trips()

@st.dialog("My Profile")
def profile_dialog(email, total, upcoming, ongoing, completed):
    st.markdown(f"""
    <div style="text-align:center;padding:0.5rem 0 1.2rem;">
        <div style="font-size:3rem;">👤</div>
        <div style="font-weight:700;font-size:1rem;color:#1a1a1a;margin-top:0.3rem;">{email}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;margin-bottom:1.4rem;">
        <div style="background:#f4fbfb;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #20878E;">
            <div style="font-size:1.6rem;font-weight:800;color:#20878E;">{total}</div>
            <div style="font-size:0.75rem;color:#888;margin-top:2px;">Total Trips</div>
        </div>
        <div style="background:#f0f8ff;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #92C4C6;">
            <div style="font-size:1.6rem;font-weight:800;color:#92C4C6;">{upcoming}</div>
            <div style="font-size:0.75rem;color:#888;margin-top:2px;">Upcoming</div>
        </div>
        <div style="background:#fffdf4;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #F3C375;">
            <div style="font-size:1.6rem;font-weight:800;color:#c8860a;">{ongoing}</div>
            <div style="font-size:0.75rem;color:#888;margin-top:2px;">Ongoing</div>
        </div>
        <div style="background:#fff8f4;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #D66F29;">
            <div style="font-size:1.6rem;font-weight:800;color:#D66F29;">{completed}</div>
            <div style="font-size:0.75rem;color:#888;margin-top:2px;">Completed</div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Sign Out", type="secondary", use_container_width=True, key="profile_signout"):
        auth.logout()

def show_dashboard():
    user_email = st.session_state.auth_user.email if auth.is_authenticated() else ""
    trips = st.session_state.all_trips
    for i, t in enumerate(trips):
        sd = t.get("start_date")
        if sd:
            new_status = compute_status(sd, t["days"])
            if new_status != t.get("status"):
                st.session_state.all_trips[i]["status"] = new_status
                try: db.update_trip_status(t["id"], new_status)
                except: pass
    trips = st.session_state.all_trips
    total_trips = len(trips)
    completed = sum(1 for t in trips if t.get('status') == 'Completed')
    ongoing   = sum(1 for t in trips if t.get('status') == 'Ongoing')
    upcoming  = sum(1 for t in trips if t.get('status') == 'Upcoming')

    nav_col, prof_col = st.columns([8, 1])
    with nav_col:
        st.markdown('<div class="navbar"><span class="navbar-brand">✈️ Wandr</span></div>', unsafe_allow_html=True)
    with prof_col:
        st.markdown('<div class="profile-btn-wrap">', unsafe_allow_html=True)
        if st.button("👤", key="profile_btn", use_container_width=True):
            profile_dialog(user_email, total_trips, upcoming, ongoing, completed)
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    btn_col, _ = st.columns([1, 3])
    with btn_col:
        st.markdown('<div class="create-btn-wrap">', unsafe_allow_html=True)
        if st.button("＋  Plan a New Trip", use_container_width=True, key="open_creator"):
            trip_creator_dialog()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    if not trips:
        st.markdown('<div style="text-align:center;color:#aaa;padding:2rem 0;">No trips yet — plan your first adventure above.</div>', unsafe_allow_html=True)
        return

    for row_start in range(0, len(trips), 3):
        row_trips = trips[row_start:row_start + 3]
        cols = st.columns(3)
        for col, (i, trip) in zip(cols, [(row_start + j, t) for j, t in enumerate(row_trips)]):
            with col:
                render_trip_card(trip, i)
                st.markdown('<div class="open-trip-btn">', unsafe_allow_html=True)
                if st.button("Open trip →", key=f"t_{i}", use_container_width=True):
                    st.session_state.selected_trip_index = i
                    st.session_state.view = "details"
                    st.rerun()
                st.markdown('</div>', unsafe_allow_html=True)

@st.dialog("Plan a New Adventure")
def trip_creator_dialog():
    trip_title = st.text_input("Trip name", placeholder="e.g. First time in Tokyo!")
    col_city, col_date = st.columns([2, 1])
    with col_city:
        target_city = st.selectbox("Destination", df['city'].unique())
    with col_date:
        start_date = st.date_input("Start date", value=date.today() + timedelta(days=7), min_value=date.today())
    col_days, col_end = st.columns(2)
    with col_days:
        trip_days = st.number_input("How many days?", 1, 30, 3)
    with col_end:
        end_date = start_date + timedelta(days=trip_days - 1)
        st.markdown(f'<div style="padding-top:1.9rem;font-size:0.85rem;color:#888;">Ends: <b style="color:#20878E;">{end_date.strftime("%b %d, %Y")}</b></div>', unsafe_allow_html=True)
    col_hotel, col_pref = st.columns(2)
    with col_hotel:
        hotel_options = df[(df['city'] == target_city) & (df['category'] == 'Hotel')]['name'].tolist()
        if hotel_options:
            hotel_labels = [f"{h}  (${int(df[df['name']==h]['cost'].values[0])}/night)" for h in hotel_options]
            chosen_hotel_label = st.selectbox("Hotel", hotel_labels)
            chosen_hotel = hotel_options[hotel_labels.index(chosen_hotel_label)]
        else:
            chosen_hotel = None
    with col_pref:
        user_pref = st.multiselect("Interests", [c for c in df['category'].unique() if c != 'Hotel'])
    opt1, opt2 = st.columns(2)
    with opt1:
        allow_out = st.checkbox("Allow outdoor spots in rain", value=False)
    with opt2:
        rest_on_arrival = st.toggle("Rest on Day 1 Morning?", value=True,
                                    help="Stay at the hotel for the first morning to recover from travel.")
    previous_city_trips = [t for t in st.session_state.all_trips if t['city'] == target_city]
    previously_used = set()
    for t in previous_city_trips:
        previously_used.update(t['plan_df']['name'].tolist())
    exclude_visited = False
    if previous_city_trips:
        st.markdown("---")
        st.markdown(f"""<div style="background:#f4fbfb;border-left:4px solid #20878E;border-radius:10px;padding:0.8rem 1rem;margin-bottom:0.5rem;">
            <div style="font-weight:700;color:#20878E;">You've been to {target_city} before!</div>
            <div style="font-size:0.85rem;color:#555;margin-top:3px;">You've visited {len(previously_used)} spots across {len(previous_city_trips)} trip{'s' if len(previous_city_trips)>1 else ''}.</div>
        </div>""", unsafe_allow_html=True)
        exclude_visited = st.checkbox("Find new spots I haven't visited yet", value=True)
        if exclude_visited:
            city_sights = df[(df['city'] == target_city) & (df['category'] != 'Hotel')]['name'].tolist()
            fresh_count = len([s for s in city_sights if s not in previously_used])
            if fresh_count < trip_days * 4:
                st.markdown(f"""<div style="background:#fffdf4;border-left:4px solid #F3C375;border-radius:10px;padding:0.8rem 1rem;">
                    <div style="font-weight:700;color:#c8860a;">Only ~{fresh_count} unvisited spots left in {target_city}.</div>
                    <div style="font-size:0.85rem;color:#555;margin-top:3px;">Some spots may be repeated.</div>
                </div>""", unsafe_allow_html=True)
    if st.button("Generate My Plan", use_container_width=True, type="primary"):
        API_KEY = "d572bff0064eb6c677271a9e9cde858d"
        cond, temp = get_weather_status(target_city, API_KEY)
        forecast = get_forecast(target_city, API_KEY)
        filtered = df[df['city'] == target_city].copy()
        if user_pref:
            filtered = filtered[filtered['category'].isin(user_pref + ['Hotel'])]
        if cond in ["Rain", "Drizzle", "Thunderstorm"] and not allow_out:
            filtered = filtered[filtered['type'] == 'Indoor']
        st.toast(f"Planning your {trip_days}-day adventure in {target_city}...", icon="✈️")
        time.sleep(1.5)
        itinerary = organize_itinerary(filtered, trip_days, target_city, df, rest_on_arrival,
                                       previously_used=previously_used, exclude_visited=exclude_visited,
                                       chosen_hotel=chosen_hotel)
        cost = predict_total_budget(trip_days, itinerary)
        new_trip = {
            "title": trip_title.strip() or f"Trip to {target_city}",
            "city": target_city, "plan_df": itinerary, "cost": cost,
            "weather": {"condition": cond, "temp": temp}, "forecast": forecast,
            "days": trip_days, "start_date": start_date, "end_date": end_date,
            "status": compute_status(start_date, trip_days)
        }
        try:
            trip_id = db.save_trip(user_id, new_trip)
            new_trip["id"] = trip_id
        except Exception:
            pass
        st.session_state.all_trips.insert(0, new_trip)
        st.rerun()

def show_details():
    trip_index = st.session_state.selected_trip_index
    if trip_index is None or trip_index >= len(st.session_state.all_trips):
        st.session_state.view = "dashboard"; st.rerun()
    trip = st.session_state.all_trips[trip_index]
    plan_df = trip['plan_df']
    forecast = trip.get('forecast', {})
    forecast_dates = sorted(forecast.keys())
    cond, temp = trip['weather']['condition'], trip['weather']['temp']

    col_back, col_hero, col_del = st.columns([1, 4, 1])
    with col_back:
        st.markdown('<div class="details-btn-col">', unsafe_allow_html=True)
        if st.button("Back", use_container_width=True):
            st.session_state.view = "dashboard"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)
    with col_hero:
        render_trip_hero(trip['city'], trip.get('title', trip['city']), trip['days'], cond, temp)
    with col_del:
        st.markdown('<div class="details-btn-col">', unsafe_allow_html=True)
        confirm_key = f"confirm_del_{trip_index}"
        if st.session_state.get(confirm_key):
            st.error("Delete this trip?")
            c1, c2 = st.columns(2)
            if c1.button("Yes", type="primary", key=f"yes_{trip_index}"):
                trip_id = trip.get("id")
                if trip_id:
                    try: db.delete_trip(trip_id)
                    except: pass
                st.session_state.all_trips.pop(trip_index)
                st.session_state[confirm_key] = False
                st.session_state.view = "dashboard"; st.rerun()
            if c2.button("No", key=f"no_{trip_index}"):
                st.session_state[confirm_key] = False; st.rerun()
        else:
            if st.button("Delete Trip", type="secondary", use_container_width=True, key=f"del_{trip_index}"):
                st.session_state[confirm_key] = True; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    STATUS_COLORS = {"Upcoming": "#92C4C6", "Ongoing": "#F3C375", "Completed": "#20878E"}
    current_status = trip.get('status', 'Upcoming')
    sc = STATUS_COLORS.get(current_status, "#92C4C6")
    sd, ed = trip.get('start_date'), trip.get('end_date')
    date_str = ""
    if sd and ed:
        def fmt(d):
            if isinstance(d, str): d = datetime.strptime(d, "%Y-%m-%d").date()
            return d.strftime("%b %d, %Y")
        date_str = f"&nbsp;·&nbsp; {fmt(sd)} → {fmt(ed)}"
    st.markdown(f"""<div style="display:inline-flex;align-items:center;gap:0.6rem;margin-bottom:1rem;">
        <span style="background:{sc}22;color:{sc};border:1.5px solid {sc};border-radius:20px;padding:3px 14px;font-size:0.8rem;font-weight:700;">{current_status}</span>
        <span style="color:#888;font-size:0.82rem;">{date_str}</span>
    </div>""", unsafe_allow_html=True)

    hotel_rows = plan_df[plan_df['category'] == 'Hotel']
    nightly = hotel_rows['cost'].max() if not hotel_rows.empty else 0
    non_hotel = plan_df[plan_df['category'] != 'Hotel'].drop_duplicates(subset=['day_num', 'name'])
    render_budget_boxes(trip['cost'], nightly, non_hotel['cost'].sum(), 40 * trip['days'], trip['days'])
    st.markdown("<br>", unsafe_allow_html=True)

    tab1, tab2 = st.tabs(["Overview Map", "Daily Itinerary"])
    with tab1:
        if not plan_df.empty:
            m = folium.Map(location=[plan_df['lat'].mean(), plan_df['lon'].mean()], zoom_start=12,
                           tiles='https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', attr='Google')
            seen_coords, stop_counter = {}, 0
            for _, row in plan_df.iterrows():
                key = (round(row['lat'], 5), round(row['lon'], 5))
                if key not in seen_coords:
                    stop_counter += 1; seen_coords[key] = stop_counter
            for _, row in plan_df.iterrows():
                key = (round(row['lat'], 5), round(row['lon'], 5))
                stop_num = seen_coords[key]
                if row['category'] == 'Hotel': color, label = "#D66F29", "H"
                elif row['category'] == 'Food': color, label = "#c8860a", str(stop_num)
                else: color, label = "#20878E", str(stop_num)
                folium.Marker([row['lat'], row['lon']],
                    popup=folium.Popup(f"<b>Stop {stop_num} — Day {row['day_num']}</b><br>{row['slot']}: {row['name']}", max_width=220),
                    icon=make_map_marker(color, label)).add_to(m)
            st_folium(m, width=None, height=460, returned_objects=[], key=f"map_overview_{trip_index}")
            render_map_legend()
            render_section_title("Full Trip Schedule", "margin-top:1.4rem;")
            for day in range(1, int(plan_df['day_num'].max()) + 1):
                with st.expander(f"Day {day}", expanded=(day == 1)):
                    for _, row in plan_df[plan_df['day_num'] == day].sort_values('slot').iterrows():
                        render_schedule_card(row)
        else:
            st.warning("No spots available for this trip.")

    with tab2:
        total_days = int(plan_df['day_num'].max())
        selected_day = st.selectbox("Select a day:", [f"Day {d}" for d in range(1, total_days + 1)], key=f"day_sel_{trip_index}")
        day_num = int(selected_day.split(" ")[1])
        day_data = plan_df[plan_df['day_num'] == day_num].sort_values('slot')
        if forecast_dates and day_num - 1 < len(forecast_dates):
            fc_cond, fc_temp = forecast.get(forecast_dates[day_num - 1], (cond, temp))
        else:
            fc_cond, fc_temp = cond, temp
        coords = [f"{r['lon']},{r['lat']}" for _, r in day_data.iterrows()]
        total_km, route_geometry = 0.0, None
        if len(coords) > 1:
            try:
                r = requests.get(
                    f"http://router.project-osrm.org/route/v1/driving/{';'.join(coords)}?overview=full&geometries=geojson&steps=true",
                    timeout=5).json()
                if r.get('routes'):
                    total_km = r['routes'][0]['distance'] / 1000
                    route_geometry = []
                    for leg in r['routes'][0]['legs']:
                        for step in leg['steps']:
                            route_geometry.extend(step['geometry']['coordinates'])
            except:
                pass
        render_info_strips(selected_day, fc_cond, fc_temp, total_km)
        m_day = folium.Map(location=[day_data['lat'].mean(), day_data['lon'].mean()], zoom_start=14,
                           tiles='https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', attr='Google')
        if route_geometry:
            folium.PolyLine([[p[1], p[0]] for p in route_geometry], color="#D66F29", weight=4, opacity=0.9).add_to(m_day)
        for i, (_, row) in enumerate(day_data.iterrows()):
            label = "H" if row['category'] == 'Hotel' else str(i + 1)
            color = "#D66F29" if row['category'] == 'Hotel' else "#c8860a" if row['category'] == 'Food' else "#20878E"
            folium.Marker([row['lat'], row['lon']],
                popup=folium.Popup(f"<b>{row['slot']}</b><br>{row['name']}", max_width=200),
                icon=make_map_marker(color, label)).add_to(m_day)
        st_folium(m_day, width=None, height=420, returned_objects=[], key=f"map_day_{trip_index}_{day_num}")
        render_section_title("Schedule")
        for _, row in day_data.iterrows():
            render_schedule_card(row)

if st.session_state.view == "dashboard":
    show_dashboard()
elif st.session_state.view == "details":
    show_details()

st.set_page_config(page_title="Wandr", page_icon="✈️", layout="wide")
st.markdown('<meta name="viewport" content="width=device-width, initial-scale=1.0">', unsafe_allow_html=True)

if 'view' not in st.session_state: st.session_state.view = "dashboard"
if 'selected_trip_index' not in st.session_state: st.session_state.selected_trip_index = None

with open("style.css", encoding="utf-8") as f:
    st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)

if not auth.is_authenticated():
    auth.show_auth()
    st.stop()

user_id = auth.get_user_id()

@st.cache_data(ttl=3600)
def load_data():
    try:
        result = db.get_locations()
        if not result.empty and 'city' in result.columns:
            return result
    except Exception:
        pass
    return pd.read_csv("locations.csv")

df = load_data()

def refresh_trips():
    st.session_state.all_trips = db.get_trips(user_id)

if 'all_trips' not in st.session_state:
    refresh_trips()

@st.dialog("My Profile")
def profile_dialog(email, total, upcoming, ongoing, completed):
    st.markdown(f"""
    <div style="text-align:center;padding:0.5rem 0 1.2rem;">
        <div style="font-size:3rem;">👤</div>
        <div style="font-weight:700;font-size:1rem;color:#1a1a1a;margin-top:0.3rem;">{email}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;margin-bottom:1.4rem;">
        <div style="background:#f4fbfb;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #20878E;">
            <div style="font-size:1.6rem;font-weight:800;color:#20878E;">{total}</div>
            <div style="font-size:0.75rem;color:#888;">Total Trips</div>
        </div>
        <div style="background:#f0f8ff;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #92C4C6;">
            <div style="font-size:1.6rem;font-weight:800;color:#92C4C6;">{upcoming}</div>
            <div style="font-size:0.75rem;color:#888;">Upcoming</div>
        </div>
        <div style="background:#fffdf4;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #F3C375;">
            <div style="font-size:1.6rem;font-weight:800;color:#c8860a;">{ongoing}</div>
            <div style="font-size:0.75rem;color:#888;">Ongoing</div>
        </div>
        <div style="background:#fff8f4;border-radius:12px;padding:0.9rem;text-align:center;border-top:3px solid #D66F29;">
            <div style="font-size:1.6rem;font-weight:800;color:#D66F29;">{completed}</div>
            <div style="font-size:0.75rem;color:#888;">Completed</div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Sign Out", type="secondary", use_container_width=True, key="profile_signout"):
        auth.logout()

def show_dashboard():
    user_email = st.session_state.auth_user.email if auth.is_authenticated() else ""
    trips = st.session_state.all_trips
    for i, t in enumerate(trips):
        sd = t.get("start_date")
        if sd:
            new_status = compute_status(sd, t["days"])
            if new_status != t.get("status"):
                st.session_state.all_trips[i]["status"] = new_status
                try: db.update_trip_status(t["id"], new_status)
                except: pass
    trips = st.session_state.all_trips
    total_trips = len(trips)
    completed = sum(1 for t in trips if t.get('status') == 'Completed')
    ongoing   = sum(1 for t in trips if t.get('status') == 'Ongoing')
    upcoming  = sum(1 for t in trips if t.get('status') == 'Upcoming')

    nav_col, prof_col = st.columns([8, 1])
    with nav_col:
        st.markdown('<div class="navbar"><span class="navbar-brand">✈️ Wandr</span></div>', unsafe_allow_html=True)
    with prof_col:
        st.markdown('<div class="profile-btn-wrap">', unsafe_allow_html=True)
        if st.button("👤", key="profile_btn", use_container_width=True):
            profile_dialog(user_email, total_trips, upcoming, ongoing, completed)
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    btn_col, _ = st.columns([1, 3])
    with btn_col:
        st.markdown('<div class="create-btn-wrap">', unsafe_allow_html=True)
        if st.button("＋  Plan a New Trip", use_container_width=True, key="open_creator"):
            trip_creator_dialog()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    if not trips:
        st.markdown('<div style="text-align:center;color:#aaa;padding:2rem 0;">No trips yet — plan your first adventure above.</div>', unsafe_allow_html=True)
        return

    for row_start in range(0, len(trips), 3):
        row_trips = trips[row_start:row_start + 3]
        cols = st.columns(3)
        for col, (i, trip) in zip(cols, [(row_start + j, t) for j, t in enumerate(row_trips)]):
            with col:
                render_trip_card(trip, i)
                st.markdown('<div class="open-trip-btn">', unsafe_allow_html=True)
                if st.button("Open trip →", key=f"t_{i}", use_container_width=True):
                    st.session_state.selected_trip_index = i
                    st.session_state.view = "details"
                    st.rerun()
                st.markdown('</div>', unsafe_allow_html=True)

@st.dialog("Plan a New Adventure")
def trip_creator_dialog():
    trip_title = st.text_input("Trip name", placeholder="e.g. First time in Tokyo!")
    col_city, col_date = st.columns([2, 1])
    with col_city:
        target_city = st.selectbox("Destination", df['city'].unique())
    with col_date:
        start_date = st.date_input("Start date", value=date.today() + timedelta(days=7), min_value=date.today())
    col_days, col_end = st.columns(2)
    with col_days:
        trip_days = st.number_input("How many days?", 1, 30, 3)
    with col_end:
        end_date = start_date + timedelta(days=trip_days - 1)
        st.markdown(f'<div style="padding-top:1.9rem;font-size:0.85rem;color:#888;">Ends: <b style="color:#20878E;">{end_date.strftime("%b %d, %Y")}</b></div>', unsafe_allow_html=True)
    col_hotel, col_pref = st.columns(2)
    with col_hotel:
        hotel_options = df[(df['city'] == target_city) & (df['category'] == 'Hotel')]['name'].tolist()
        if hotel_options:
            hotel_labels = [f"{h}  (${int(df[df['name']==h]['cost'].values[0])}/night)" for h in hotel_options]
            chosen_hotel_label = st.selectbox("Hotel", hotel_labels)
            chosen_hotel = hotel_options[hotel_labels.index(chosen_hotel_label)]
        else:
            chosen_hotel = None
    with col_pref:
        user_pref = st.multiselect("Interests", [c for c in df['category'].unique() if c != 'Hotel'])
    opt1, opt2 = st.columns(2)
    with opt1:
        allow_out = st.checkbox("Allow outdoor spots in rain", value=False)
    with opt2:
        rest_on_arrival = st.toggle("Rest on Day 1 Morning?", value=True,
                                    help="Stay at the hotel for the first morning to recover from travel.")
    previous_city_trips = [t for t in st.session_state.all_trips if t['city'] == target_city]
    previously_used = set()
    for t in previous_city_trips:
        previously_used.update(t['plan_df']['name'].tolist())
    exclude_visited = False
    if previous_city_trips:
        st.markdown("---")
        st.markdown(f"""<div style="background:#f4fbfb;border-left:4px solid #20878E;border-radius:10px;padding:0.8rem 1rem;margin-bottom:0.5rem;">
            <div style="font-weight:700;color:#20878E;">You've been to {target_city} before!</div>
            <div style="font-size:0.85rem;color:#555;margin-top:3px;">You've visited {len(previously_used)} spots across {len(previous_city_trips)} trip{'s' if len(previous_city_trips)>1 else ''}.</div>
        </div>""", unsafe_allow_html=True)
        exclude_visited = st.checkbox("Find new spots I haven't visited yet", value=True)
        if exclude_visited:
            city_sights = df[(df['city'] == target_city) & (df['category'] != 'Hotel')]['name'].tolist()
            fresh_count = len([s for s in city_sights if s not in previously_used])
            if fresh_count < trip_days * 4:
                st.markdown(f"""<div style="background:#fffdf4;border-left:4px solid #F3C375;border-radius:10px;padding:0.8rem 1rem;">
                    <div style="font-weight:700;color:#c8860a;">Only ~{fresh_count} unvisited spots left in {target_city}.</div>
                    <div style="font-size:0.85rem;color:#555;margin-top:3px;">Some spots may be repeated.</div>
                </div>""", unsafe_allow_html=True)
    if st.button("Generate My Plan", use_container_width=True, type="primary"):
        API_KEY = "d572bff0064eb6c677271a9e9cde858d"
        cond, temp = get_weather_status(target_city, API_KEY)
        forecast = get_forecast(target_city, API_KEY)
        filtered = df[df['city'] == target_city].copy()
        if user_pref:
            filtered = filtered[filtered['category'].isin(user_pref + ['Hotel'])]
        if cond in ["Rain", "Drizzle", "Thunderstorm"] and not allow_out:
            filtered = filtered[filtered['type'] == 'Indoor']
        st.toast(f"Planning your {trip_days}-day adventure in {target_city}...", icon="✈️")
        time.sleep(1.5)
        itinerary = organize_itinerary(filtered, trip_days, target_city, df, rest_on_arrival,
                                       previously_used=previously_used, exclude_visited=exclude_visited,
                                       chosen_hotel=chosen_hotel)
        cost = predict_total_budget(trip_days, itinerary)
        new_trip = {
            "title": trip_title.strip() or f"Trip to {target_city}",
            "city": target_city, "plan_df": itinerary, "cost": cost,
            "weather": {"condition": cond, "temp": temp}, "forecast": forecast,
            "days": trip_days, "start_date": start_date, "end_date": end_date,
            "status": compute_status(start_date, trip_days)
        }
        try:
            trip_id = db.save_trip(user_id, new_trip)
            new_trip["id"] = trip_id
        except Exception:
            pass
        st.session_state.all_trips.insert(0, new_trip)
        st.rerun()

def show_details():
    trip_index = st.session_state.selected_trip_index
    if trip_index is None or trip_index >= len(st.session_state.all_trips):
        st.session_state.view = "dashboard"; st.rerun()
    trip = st.session_state.all_trips[trip_index]
    plan_df = trip['plan_df']
    forecast = trip.get('forecast', {})
    forecast_dates = sorted(forecast.keys())
    cond, temp = trip['weather']['condition'], trip['weather']['temp']

    col_back, col_hero, col_del = st.columns([1, 4, 1])
    with col_back:
        st.markdown('<div class="details-btn-col">', unsafe_allow_html=True)
        if st.button("Back", use_container_width=True):
            st.session_state.view = "dashboard"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)
    with col_hero:
        render_trip_hero(trip['city'], trip.get('title', trip['city']), trip['days'], cond, temp)
    with col_del:
        st.markdown('<div class="details-btn-col">', unsafe_allow_html=True)
        confirm_key = f"confirm_del_{trip_index}"
        if st.session_state.get(confirm_key):
            st.error("Delete this trip?")
            c1, c2 = st.columns(2)
            if c1.button("Yes", type="primary", key=f"yes_{trip_index}"):
                trip_id = trip.get("id")
                if trip_id:
                    try: db.delete_trip(trip_id)
                    except: pass
                st.session_state.all_trips.pop(trip_index)
                st.session_state[confirm_key] = False
                st.session_state.view = "dashboard"; st.rerun()
            if c2.button("No", key=f"no_{trip_index}"):
                st.session_state[confirm_key] = False; st.rerun()
        else:
            if st.button("Delete Trip", type="secondary", use_container_width=True, key=f"del_{trip_index}"):
                st.session_state[confirm_key] = True; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    STATUS_COLORS = {"Upcoming": "#92C4C6", "Ongoing": "#F3C375", "Completed": "#20878E"}
    current_status = trip.get('status', 'Upcoming')
    sc = STATUS_COLORS.get(current_status, "#92C4C6")
    sd, ed = trip.get('start_date'), trip.get('end_date')
    date_str = ""
    if sd and ed:
        def fmt(d):
            if isinstance(d, str): d = datetime.strptime(d, "%Y-%m-%d").date()
            return d.strftime("%b %d, %Y")
        date_str = f"&nbsp;·&nbsp; {fmt(sd)} → {fmt(ed)}"
    st.markdown(f"""<div style="display:inline-flex;align-items:center;gap:0.6rem;margin-bottom:1rem;">
        <span style="background:{sc}22;color:{sc};border:1.5px solid {sc};border-radius:20px;padding:3px 14px;font-size:0.8rem;font-weight:700;">{current_status}</span>
        <span style="color:#888;font-size:0.82rem;">{date_str}</span>
    </div>""", unsafe_allow_html=True)

    hotel_rows = plan_df[plan_df['category'] == 'Hotel']
    nightly = hotel_rows['cost'].max() if not hotel_rows.empty else 0
    non_hotel = plan_df[plan_df['category'] != 'Hotel'].drop_duplicates(subset=['day_num', 'name'])
    render_budget_boxes(trip['cost'], nightly, non_hotel['cost'].sum(), 40 * trip['days'], trip['days'])
    st.markdown("<br>", unsafe_allow_html=True)
    tab1, tab2 = st.tabs(["Overview Map", "Daily Itinerary"])

    with tab1:
        if not plan_df.empty:
            m = folium.Map(location=[plan_df['lat'].mean(), plan_df['lon'].mean()], zoom_start=12,
                           tiles='https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', attr='Google')
            seen_coords, stop_counter = {}, 0
            for _, row in plan_df.iterrows():
                key = (round(row['lat'], 5), round(row['lon'], 5))
                if key not in seen_coords:
                    stop_counter += 1; seen_coords[key] = stop_counter
            for _, row in plan_df.iterrows():
                key = (round(row['lat'], 5), round(row['lon'], 5))
                stop_num = seen_coords[key]
                if row['category'] == 'Hotel': color, label = "#D66F29", "H"
                elif row['category'] == 'Food': color, label = "#c8860a", str(stop_num)
                else: color, label = "#20878E", str(stop_num)
                folium.Marker([row['lat'], row['lon']],
                    popup=folium.Popup(f"<b>Stop {stop_num} — Day {row['day_num']}</b><br>{row['slot']}: {row['name']}", max_width=220),
                    icon=make_map_marker(color, label)).add_to(m)
            st_folium(m, width=None, height=460, returned_objects=[], key=f"map_overview_{trip_index}")
            render_map_legend()
            render_section_title("Full Trip Schedule", "margin-top:1.4rem;")
            for day in range(1, int(plan_df['day_num'].max()) + 1):
                with st.expander(f"Day {day}", expanded=(day == 1)):
                    for _, row in plan_df[plan_df['day_num'] == day].sort_values('slot').iterrows():
                        render_schedule_card(row)
        else:
            st.warning("No spots available for this trip.")

    with tab2:
        total_days = int(plan_df['day_num'].max())
        selected_day = st.selectbox("Select a day:", [f"Day {d}" for d in range(1, total_days + 1)], key=f"day_sel_{trip_index}")
        day_num = int(selected_day.split(" ")[1])
        day_data = plan_df[plan_df['day_num'] == day_num].sort_values('slot')
        if forecast_dates and day_num - 1 < len(forecast_dates):
            fc_cond, fc_temp = forecast.get(forecast_dates[day_num - 1], (cond, temp))
        else:
            fc_cond, fc_temp = cond, temp
        coords = [f"{r['lon']},{r['lat']}" for _, r in day_data.iterrows()]
        total_km, route_geometry = 0.0, None
        if len(coords) > 1:
            try:
                r = requests.get(
                    f"http://router.project-osrm.org/route/v1/driving/{';'.join(coords)}?overview=full&geometries=geojson&steps=true",
                    timeout=5).json()
                if r.get('routes'):
                    total_km = r['routes'][0]['distance'] / 1000
                    route_geometry = []
                    for leg in r['routes'][0]['legs']:
                        for step in leg['steps']:
                            route_geometry.extend(step['geometry']['coordinates'])
            except:
                pass
        render_info_strips(selected_day, fc_cond, fc_temp, total_km)
        m_day = folium.Map(location=[day_data['lat'].mean(), day_data['lon'].mean()], zoom_start=14,
                           tiles='https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', attr='Google')
        if route_geometry:
            folium.PolyLine([[p[1], p[0]] for p in route_geometry], color="#D66F29", weight=4, opacity=0.9).add_to(m_day)
        for i, (_, row) in enumerate(day_data.iterrows()):
            label = "H" if row['category'] == 'Hotel' else str(i + 1)
            color = "#D66F29" if row['category'] == 'Hotel' else "#c8860a" if row['category'] == 'Food' else "#20878E"
            folium.Marker([row['lat'], row['lon']],
                popup=folium.Popup(f"<b>{row['slot']}</b><br>{row['name']}", max_width=200),
                icon=make_map_marker(color, label)).add_to(m_day)
        st_folium(m_day, width=None, height=420, returned_objects=[], key=f"map_day_{trip_index}_{day_num}")
        render_section_title("Schedule")
        for _, row in day_data.iterrows():
            render_schedule_card(row)

if st.session_state.view == "dashboard":
    show_dashboard()
elif st.session_state.view == "details":
    show_details()
