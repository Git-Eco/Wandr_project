import streamlit as st
import pandas as pd
import numpy as np
import folium
from streamlit_folium import st_folium
import requests
from sklearn.linear_model import LinearRegression

# --- 1. CORE FUNCTIONS ---
def get_weather_status(city, api_key):
    try:
        url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}&units=metric"
        response = requests.get(url).json()
        if response.get("cod") == 200:
            return response["weather"][0]["main"], response["main"]["temp"]
        return "Unknown", None
    except:
        return "Unknown", None

def predict_total_budget(num_days, selected_activities_df):
    if selected_activities_df.empty: return 0
    actual_activity_sum = selected_activities_df['cost'].sum()
    daily_base_cost = 150 
    days_train = np.array([[num_days-1], [num_days], [num_days+1]])
    costs_train = np.array([(d * daily_base_cost + actual_activity_sum) for d in [num_days-1, num_days, num_days+1]])
    model = LinearRegression().fit(days_train, costs_train)
    return model.predict([[num_days]])[0]

def organize_itinerary(filtered_df, days, target_city, full_database):
    total_needed = days * 3 
    
    # 1. Get all spots for this city (including Food/Cafes)
    city_pool = full_database[full_database['city'] == target_city].copy()
    
    # Start with user preferences, then add everything else from the city to reach total_needed
    final_plan = pd.concat([filtered_df, city_pool[~city_pool['name'].isin(filtered_df['name'])]])
    
    # If still not enough, repeat the pool (fallback)
    while len(final_plan) < total_needed:
        final_plan = pd.concat([final_plan, city_pool])
    
    final_plan = final_plan.head(total_needed).reset_index(drop=True)

    # 2. NEAREST NEIGHBOR SORTING (Prevents Wonky Routes)
    ordered_spots = []
    remaining_spots = final_plan.to_dict('records')
    
    # Start with the first spot in the list
    current_spot = remaining_spots.pop(0)
    ordered_spots.append(current_spot)
    
    while remaining_spots:
        # Find the spot closest to the current one
        idx = 0
        min_dist = float('inf')
        for i, spot in enumerate(remaining_spots):
            # Simple Euclidean distance for sorting (Lat/Lon)
            d = ((current_spot['lat'] - spot['lat'])**2 + (current_spot['lon'] - spot['lon'])**2)**0.5
            if d < min_dist:
                min_dist = d
                idx = i
        current_spot = remaining_spots.pop(idx)
        ordered_spots.append(current_spot)

    optimized_df = pd.DataFrame(ordered_spots)

    # 3. Assign Days and Slots
    day_nums = []
    slot_assignments = []
    slot_names = ["Morning 🌅", "Afternoon ☀️", "Evening 🌙"]
    
    for d in range(1, days + 1):
        for s in range(3):
            day_nums.append(d)
            slot_assignments.append(slot_names[s])

    optimized_df['day_num'] = day_nums[:len(optimized_df)]
    optimized_df['slot'] = pd.Categorical(slot_assignments[:len(optimized_df)], categories=slot_names, ordered=True)
    
    return optimized_df.sort_values(by=['day_num', 'slot'])

# --- 2. INITIALIZATION & DATA ---
st.set_page_config(page_title="Wandr", page_icon="✈️", layout="wide")

if 'all_trips' not in st.session_state: st.session_state.all_trips = []
if 'view' not in st.session_state: st.session_state.view = "dashboard"
if 'selected_trip' not in st.session_state: st.session_state.selected_trip = None

@st.cache_data
def load_data():
    return pd.read_csv("locations.csv")
df = load_data()

# --- 3. SCREEN: DASHBOARD ---
def show_dashboard():
    st.title("📂 Your Trip Gallery")
    cols = st.columns(3)
    with cols[0]:
        if st.button("➕\n\nCreate New Trip", use_container_width=True):
            trip_creator_dialog()

    for i, trip in enumerate(st.session_state.all_trips):
        with cols[(i + 1) % 3]:
            if st.button(f"📍 {trip['city']}\n\nBudget: ${trip['cost']:,.0f}", key=f"t_{i}", use_container_width=True):
                st.session_state.selected_trip = trip
                st.session_state.view = "details"
                st.rerun()

# --- 4. SCREEN: CREATOR (Dialog) ---
@st.dialog("✨ Plan a New Adventure")
def trip_creator_dialog():
    target_city = st.selectbox("Where are you going?", df['city'].unique())
    trip_days = st.number_input("How many days?", 1, 30, 3)
    user_pref = st.multiselect("What do you like?", df['category'].unique())
    
    st.markdown("---")
    allow_out = st.checkbox("Show outdoor spots even if it's raining", value=False)

    if st.button("Generate My Plan", use_container_width=True, type="primary"):
            # 1. WEATHER API CALL
            API_KEY = "d572bff0064eb6c677271a9e9cde858d"
            cond, temp = get_weather_status(target_city, API_KEY)
            
            # 2. DATA GUARD
            city_data = df[df['city'] == target_city]
            available_count = len(city_data)
            max_possible_days = available_count // 3
            
            final_days = trip_days
            if available_count < (trip_days * 3):
                final_days = max(1, max_possible_days)
                # --- THE FIX: Use st.toast and a tiny sleep ---
                st.toast(f"ℹ️ Adjusted to {final_days} days based on available spots in {target_city}.", icon="💡")
            import time
            time.sleep(1.5) # Gives the user 1.5 seconds to read the toast

            # 3. FILTERING (Smart Combination of Preferences + Weather)
            is_raining = cond in ["Rain", "Drizzle", "Thunderstorm"]
            
            # Start with spots in the target city
            filtered = city_data.copy()
            
            # Filter by User Preferences if they picked any
            if user_pref:
                filtered = filtered[filtered['category'].isin(user_pref)]
            
            # Filter by Weather if it's raining and they want to stay dry
            if is_raining and not allow_out:
                filtered = filtered[filtered['type'] == 'Indoor']

            # 4. ORGANIZE (The Brain)
            # We pass 'final_days' (the guarded number) to ensure the loops work perfectly
            final_itinerary = organize_itinerary(filtered, final_days, target_city, df)
            
            # 5. BUDGET & SAVE
            total_cost = predict_total_budget(final_days, final_itinerary)
            
            st.session_state.all_trips.append({
                "city": target_city, 
                "plan_df": final_itinerary, 
                "cost": total_cost, 
                "weather": {"condition": cond, "temp": temp}, 
                "days": final_days # Save the adjusted day count
            })
            
            st.rerun()

# --- 5. SCREEN: DETAILS ---
def show_details():
    try:
        trip_index = st.session_state.all_trips.index(st.session_state.selected_trip)
    except ValueError:
        st.session_state.view = "dashboard"
        st.rerun()

    trip = st.session_state.selected_trip
    col_back, _, col_del = st.columns([1, 2, 1])
    
    with col_back:
        if st.button("⬅️ Back to Gallery"):
            st.session_state.view = "dashboard"
            st.session_state.confirm_delete = False 
            st.rerun()
            
    with col_del:
        confirm_key = f"delete_confirm_{trip_index}"
        
        if st.session_state.get(confirm_key):
            st.error("Delete this trip?")
            c1, c2 = st.columns(2)
            if c1.button("✅ Yes", type="primary", key=f"yes_{trip_index}"):
                st.session_state.all_trips.pop(trip_index)
                st.session_state[confirm_key] = False 
                st.session_state.view = "dashboard"
                st.rerun()
            if c2.button("❌ No", key=f"no_{trip_index}"):
                st.session_state[confirm_key] = False
                st.rerun()
        else:
            if st.button("🗑️ Delete Trip", type="secondary", use_container_width=True, key=f"del_btn_{trip_index}"):
                st.session_state[confirm_key] = True
                st.rerun()

    st.title(f"Trip Details: {trip['city']}")
    tab1, tab2, tab3 = st.tabs(["🗺️ Map", "📅 Daily Itinerary", "🌤️ Weather"])
    
    with tab1:
        plan_df = trip['plan_df']
        
        if not plan_df.empty:
            center_lat = plan_df['lat'].mean()
            center_lon = plan_df['lon'].mean()
            
            m = folium.Map(
                location=[center_lat, center_lon], 
                zoom_start=12, 
                tiles='CartoDB positron'
            )
            
            for _, row in plan_df.iterrows():
                folium.Marker(
                    [row['lat'], row['lon']], 
                    popup=f"({row['slot']}) {row['name']}", 
                    icon=folium.Icon(color="blue", icon="info-sign")
                ).add_to(m)
            
            st_folium(m, width=800, height=500, key=f"map_{trip['city']}")
        else:
            st.warning("No spots available to show on the map for this trip.")

    with tab2:
        st.header(f"💰 Estimated Budget: ${trip['cost']:,.2f}")
        
        # 1. Day Selection
        unique_days = plan_df['day_num'].unique()
        selected_day = st.selectbox("Select Day to View:", [f"Day {d}" for d in unique_days])
        day_num = int(selected_day.split(" ")[1])
        
        day_data = plan_df[plan_df['day_num'] == day_num].sort_values('slot')
        
        # 2. Map Section
        if not day_data.empty:
            st.subheader(f"🗺️ {selected_day} Route")
            
            m_day = folium.Map(
                location=[day_data['lat'].mean(), day_data['lon'].mean()], 
                zoom_start=14, 
                tiles='https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
                attr='Google'
            )
            
            coords = [f"{r['lon']},{r['lat']}" for _, r in day_data.iterrows()]
            total_km = 0.0

            if len(coords) > 1:
                # Use 'driving' instead of 'foot' for general travel distance
                route_url = f"http://router.project-osrm.org/route/v1/driving/{';'.join(coords)}?overview=full&geometries=geojson"
                try:
                    import requests
                    r = requests.get(route_url, timeout=5).json()
                    if r.get('routes'):
                        total_km = r['routes'][0]['distance'] / 1000
                        geometry = r['routes'][0]['geometry']['coordinates']
                        folium.PolyLine([[p[1], p[0]] for p in geometry], color="#1a73e8", weight=6, opacity=0.8).add_to(m_day)
                except:
                    pass

            # Display the Distance (Generic "Travel" instead of "Walking")
            st.metric("🚗 Est. Travel Distance", f"{total_km:.2f} km")

            # Markers
            for i, (_, row) in enumerate(day_data.iterrows()):
                folium.Marker(
                    [row['lat'], row['lon']],
                    popup=f"{row['slot']}: {row['name']}",
                    icon=folium.DivIcon(html=f'<div style="background-color:#1a73e8; color:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-weight:bold; border:2px solid white;">{i+1}</div>')
                ).add_to(m_day)

            st_folium(m_day, width=None, height=450, key=f"map_{day_num}_{trip['city']}")

        st.markdown("---")
        
        # 3. ITINERARY CARDS - Guaranteed to show now!
        st.subheader("📋 Schedule Details")
        for _, row in day_data.iterrows():
            with st.container(border=True):
                c_icon, c_info = st.columns([1, 4])
                c_icon.subheader(row['slot'].split(" ")[0]) # Show only emoji/icon
                c_info.markdown(f"**{row['name']}**")
                c_info.write(f"Category: {row['category']} | Cost: ${row['cost']}")

    with tab3:
        st.metric("Current Weather", f"{trip['weather']['temp']}°C", trip['weather']['condition'])

# --- 6. MAIN CONTROLLER ---
if st.session_state.view == "dashboard":
    show_dashboard()
elif st.session_state.view == "details":
    show_details()