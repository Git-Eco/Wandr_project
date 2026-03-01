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
    if selected_activities_df.empty: 
        return 0

    temp_df = selected_activities_df.copy()
    temp_df.loc[temp_df.duplicated(subset=['day_num', 'name']), 'cost'] = 0
    actual_activity_sum = temp_df['cost'].sum()
    daily_base_cost = 40 
    
    days_train = np.array([[num_days-1], [num_days], [num_days+1]])
    costs_train = np.array([
        (d * daily_base_cost + actual_activity_sum) 
        for d in [num_days-1, num_days, num_days+1]
    ])
    
    model = LinearRegression().fit(days_train, costs_train)
    prediction = model.predict([[num_days]])[0]
    
    return round(float(prediction), 2)

def organize_itinerary(filtered_df, days, target_city, full_database, rest_mode):
    # Identify the 'Home Base' (Hotel)
    hotel_pool = full_database[(full_database['city'] == target_city) & (full_database['category'] == 'Hotel')]
    hotel = hotel_pool.iloc[0].to_dict() if not hotel_pool.empty else {
        "name": "Central Hotel", "lat": full_database[full_database['city'] == target_city]['lat'].mean(),
        "lon": full_database[full_database['city'] == target_city]['lon'].mean(), "category": "Hotel", "cost": 0
    }

    food_pool = full_database[(full_database['city'] == target_city) & (full_database['category'] == 'Food')].to_dict('records')
    sight_pool = filtered_df[filtered_df['category'] != 'Food'].to_dict('records')
    
    final_itinerary = []
    slots = ["Breakfast ☕", "Morning 🌅", "Lunch 🍔", "Afternoon ☀️", "Dinner 🍷", "Evening 🌙"]
    
    for d in range(1, days + 1):
        current_loc = hotel 
        
        for slot in slots:
            # REST MODE (Day 1 Morning only)
            if "Morning" in slot and d == 1 and rest_mode:
                chosen_spot = hotel.copy()
                chosen_spot['name'] = f"{hotel['name']} (Rest & Settle)"
                chosen_spot['cost'] = 0 
            
            # BREAKFAST (Always Hotel)
            elif "Breakfast" in slot:
                chosen_spot = hotel.copy()
            
            # LUNCH/DINNER
            elif "Lunch" in slot or "Dinner" in slot:
                pool = food_pool if food_pool else sight_pool
                best_idx = 0
                min_dist = float('inf')
                for i, s in enumerate(pool):
                    dist = ((current_loc['lat'] - s['lat'])**2 + (current_loc['lon'] - s['lon'])**2)**0.5
                    if dist < min_dist:
                        min_dist = dist
                        best_idx = i
                chosen_spot = pool.pop(best_idx).copy() if pool else hotel.copy()
            
            # SIGHTSEEING (Morning/Afternoon/Evening)
            else:
                pool = [s for s in sight_pool if s['name'] != hotel['name']]
                if not pool: pool = sight_pool 
                
                best_idx = 0
                min_dist = float('inf')
                for i, s in enumerate(pool):
                    dist = ((current_loc['lat'] - s['lat'])**2 + (current_loc['lon'] - s['lon'])**2)**0.5
                    if dist < min_dist:
                        min_dist = dist
                        best_idx = i
                
                chosen_spot = pool.pop(best_idx).copy()
                sight_pool = [s for s in sight_pool if s['name'] != chosen_spot['name']]

            chosen_spot['day_num'] = d
            chosen_spot['slot'] = slot
            final_itinerary.append(chosen_spot)
            current_loc = chosen_spot

    df_result = pd.DataFrame(final_itinerary)
    
    df_result['slot'] = pd.Categorical(
        df_result['slot'], 
        categories=slots, 
        ordered=True
    )
    
    return df_result.sort_values(by=['day_num', 'slot']).reset_index(drop=True)

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

    st.markdown("---")
    st.subheader("✈️ Rest Upon Arrival")
    rest_on_arrival = st.toggle("Rest on Day 1 Morning?", value=True, help="Stay at the hotel for the first morning to recover from travel.")

    if st.button("Generate My Plan", use_container_width=True, type="primary"):
            # WEATHER API CALL
            API_KEY = "d572bff0064eb6c677271a9e9cde858d"
            cond, temp = get_weather_status(target_city, API_KEY)
            
            city_data = df[df['city'] == target_city]
            available_count = len(city_data)
            max_possible_days = available_count // 3
            
            final_days = trip_days
            if available_count < (trip_days * 3):
                final_days = max(1, max_possible_days)
                st.toast(f"ℹ️ Adjusted to {final_days} days based on available spots in {target_city}.", icon="💡")
            import time
            time.sleep(2.5) # Gives the user 1.5 seconds to read the toast

            # FILTERING 
            is_raining = cond in ["Rain", "Drizzle", "Thunderstorm"]
            
            # Start with spots in the target city
            filtered = city_data.copy()
            
            # Filter by User Preferences if they picked any
            if user_pref:
                filtered = filtered[filtered['category'].isin(user_pref)]
            
            # Filter by Weather if it's raining and they want to stay dry
            if is_raining and not allow_out:
                filtered = filtered[filtered['type'] == 'Indoor']

            # ORGANIZE ITINERARY
            final_itinerary = organize_itinerary(filtered, final_days, target_city, df, rest_on_arrival)
            
            # BUDGET & SAVE
            total_cost = predict_total_budget(final_days, final_itinerary)
            
            st.session_state.all_trips.append({
                "city": target_city, 
                "plan_df": final_itinerary, 
                "cost": total_cost, 
                "weather": {"condition": cond, "temp": temp}, 
                "days": final_days 
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
    with st.container():
        tab1, tab2, tab3 = st.tabs(["🗺️ Map", "📅 Daily Itinerary", "🌤️ Weather"])
        
        with tab1:
            plan_df = trip['plan_df']
            
            if not plan_df.empty:
                # Show the Overview Map 
                m = folium.Map(
                    location=[plan_df['lat'].mean(), plan_df['lon'].mean()], 
                    zoom_start=12, 
                    tiles='https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
                    attr='Google'
                )
                
                for _, row in plan_df.iterrows():
                    # Logic for Colors & Icons
                    if row['category'] == 'Hotel':
                        color = "#d32f2f"  
                        icon_char = "🏨"
                    elif row['category'] == 'Food':
                        color = "#f57c00"  
                        icon_char = "🍴"
                    else:
                        color = "#1976d2"  
                        icon_char = "📍"

                    folium.Marker(
                        [row['lat'], row['lon']], 
                        popup=folium.Popup(f"<b>Day {row['day_num']}</b><br>{row['slot']}: {row['name']}", max_width=200),
                        icon=folium.DivIcon(html=f"""
                            <div style="
                                background-color: {color}; 
                                color: white; 
                                border-radius: 50%; 
                                width: 32px; 
                                height: 32px; 
                                display: flex; 
                                align-items: center; 
                                justify-content: center; 
                                border: 2px solid white; 
                                font-weight: bold;
                                font-size: 11px;
                                box-shadow: 0px 2px 4px rgba(0,0,0,0.3);
                            ">
                                {row['day_num']}
                            </div>""")
                    ).add_to(m)
                
                st_folium(m, width=None, height=400, key=f"map_overview_{trip_index}")

                st.markdown("---") 
                st.subheader("📋 Trip Schedule")
                
                total_days = int(plan_df['day_num'].max())
                for day in range(1, total_days + 1):
                    with st.expander(f"📅 Day {day}", expanded=(day == 1)):
                        day_data = plan_df[plan_df['day_num'] == day].copy()
                        day_data = day_data.sort_values('slot')
                        
                        for _, row in day_data.iterrows():
                            icon = "🏨" if row['category'] == 'Hotel' else "🍴" if row['category'] == 'Food' else "📍"
                            st.write(f"{icon} **{row['slot']}**: {row['name']} — `${row['cost']}`")

            else:
                st.warning("No spots available to show for this trip.")

        with tab2:
            st.header(f"💰 Estimated Budget: ${trip['cost']:,.2f}")
            
            # 1. Day Selection
            unique_days = plan_df['day_num'].unique()
            selected_day = st.selectbox("Select Day to View:", [f"Day {d}" for d in unique_days], key=f"day_select_{trip_index}")
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

                st.metric("🚗 Est. Travel Distance", f"{total_km:.2f} km")

                # Markers
                for i, (_, row) in enumerate(day_data.iterrows()):
                    icon_char = "🏨" if row['category'] == 'Hotel' else "🍴" if row['category'] == 'Food' else "📍"
                    color = "#d32f2f" if row['category'] == 'Hotel' else "#f57c00" if row['category'] == 'Food' else "#1976d2"
                    
                    folium.Marker(
                        [row['lat'], row['lon']],
                        popup=folium.Popup(f"<b>{row['slot']}</b><br>{row['name']}", max_width=200),
                        icon=folium.DivIcon(html=f"""
                            <div style="background-color:{color}; color:white; border-radius:50%; 
                            width:32px; height:32px; display:flex; align-items:center; justify-content:center; 
                            border:2px solid white; font-size:14px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                            {icon_char}</div>""")
                    ).add_to(m_day)

                st_folium(m_day, width=None, height=450, key=f"map_daily_{trip_index}_{day_num}")

            st.markdown("---")
            
            # 3. ITINERARY CARDS
            st.subheader("📋 Schedule Details")
            for _, row in day_data.iterrows():
                with st.container(border=True):
                    c_icon, c_info = st.columns([1, 4])
                    c_icon.subheader(row['slot'].split(" ")[0])
                    c_info.markdown(f"**{row['name']}**")
                    c_info.write(f"Category: {row['category']} | Cost: ${row['cost']}")

        with tab3:
            st.metric("Current Weather", f"{trip['weather']['temp']}°C", trip['weather']['condition'])

# --- 6. MAIN CONTROLLER ---
if st.session_state.view == "dashboard":
    show_dashboard()
elif st.session_state.view == "details":
    show_details()