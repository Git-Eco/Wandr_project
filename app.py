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

def organize_itinerary(df, days):
    df = df.sample(frac=1).reset_index(drop=True)
    
    total_available = len(df)
    organized_spots = df.copy()
    
    day_nums = []
    slot_assignments = []
    
    slot_names = ["Morning 🌅", "Afternoon ☀️", "Evening 🌙"]
    
    for i in range(total_available):
        current_day = (i % days) + 1
        day_nums.append(current_day)
        
        slot_assignments.append(slot_names[current_slot_index])

    organized_spots['day_num'] = day_nums
    
    organized_spots['slot'] = pd.Categorical(
        slot_assignments, 
        categories=slot_names, 
        ordered=True
    )
    
    return organized_spots.sort_values(by=['day_num', 'slot'])

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
        API_KEY = "d572bff0064eb6c677271a9e9cde858d"
        cond, temp = get_weather_status(target_city, API_KEY)
        f_df = df[df['city'] == target_city]
        
        is_raining = cond in ["Rain", "Drizzle", "Thunderstorm"]
        if is_raining and not allow_out:
            plan = f_df[f_df['type'] == 'Indoor']
        else:
            plan = f_df[f_df['category'].isin(user_pref)] if user_pref else f_df
        
        if not plan.empty:
            plan = organize_itinerary(plan, trip_days)
        
        cost = predict_total_budget(trip_days, plan)
        
        st.session_state.all_trips.append({
            "city": target_city, "plan_df": plan, "cost": cost, 
            "weather": {"condition": cond, "temp": temp}, "days": trip_days
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
        
        unique_days = plan_df['day_num'].unique()
        selected_day = st.selectbox("Select Day:", [f"Day {d}" for d in unique_days])
        day_num = int(selected_day.split(" ")[1])
        
        day_data = plan_df[plan_df['day_num'] == day_num]
        
        for _, row in day_data.iterrows():
            with st.container(border=True):
                c_icon, c_info = st.columns([1, 4])
                c_icon.subheader(row['slot'])
                c_info.markdown(f"### {row['name']}")
                c_info.write(f"Category: {row['category']} | Cost: ${row['cost']}")

    with tab3:
        st.metric("Current Weather", f"{trip['weather']['temp']}°C", trip['weather']['condition'])

# --- 6. MAIN CONTROLLER ---
if st.session_state.view == "dashboard":
    show_dashboard()
elif st.session_state.view == "details":
    show_details()