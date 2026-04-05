import streamlit as st
import folium

WEATHER_ICONS = {
    "Clear": "☀️", "Clouds": "☁️", "Rain": "🌧️",
    "Drizzle": "🌦️", "Thunderstorm": "⛈️", "Snow": "❄️",
    "Mist": "🌫️", "Fog": "🌫️", "Unknown": "🌡️"
}

def weather_icon(condition):
    for key in WEATHER_ICONS:
        if key.lower() in condition.lower():
            return WEATHER_ICONS[key]
    return "🌡️"

def render_hero(title, subtitle):
    st.markdown(f"""
    <div class="hero-bar">
        <h1>{title}</h1>
        <div class="sub">{subtitle}</div>
    </div>
    """, unsafe_allow_html=True)

def render_trip_hero(city, trip_title, days, cond, temp):
    icon = weather_icon(cond)
    st.markdown(f"""
    <div class="hero-bar" style="padding:1.2rem 1.6rem;margin-bottom:0;">
        <h1 style="font-size:1.5rem;">📍 {city}</h1>
        <div style="font-size:0.88rem;opacity:0.75;margin-bottom:0.4rem;">"{trip_title}"</div>
        <div class="sub">
            <span class="badge" style="background:#ffffff33;color:white;">{days} day{'s' if days > 1 else ''}</span>
            &nbsp;<span class="badge" style="background:#ffffff33;color:white;">{icon} {cond} · {temp}°C</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

def render_trip_card(trip, index):
    cond = trip['weather']['condition']
    temp = trip['weather']['temp']
    icon = weather_icon(cond)
    days = trip['days']
    title = trip.get('title', trip['city'])
    status = trip.get('status', 'Upcoming')
    status_colors = {"Upcoming": "#92C4C6", "Ongoing": "#F3C375", "Completed": "#20878E"}
    sc = status_colors.get(status, "#92C4C6")
    st.markdown(f"""
    <div class="trip-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <h3>📍 {trip['city']}</h3>
            <span style="background:{sc}22;color:{sc};border:1.5px solid {sc};
                border-radius:20px;padding:2px 10px;font-size:0.72rem;font-weight:700;white-space:nowrap;">
                {status}
            </span>
        </div>
        <div class="trip-title">"{title}"</div>
        <div class="meta">
            <span class="badge badge-days">{days} day{'s' if days > 1 else ''}</span>
            <span class="badge badge-weather">{icon} {cond} · {temp}°C</span>
        </div>
        <div class="budget">Estimated Budget: ${trip['cost']:,.0f}</div>
    </div>
    """, unsafe_allow_html=True)

def render_budget_boxes(total_cost, nightly, act_sum, misc_total, days):
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(f"""
        <div class="budget-box">
            <div class="label">Estimated Total</div>
            <div class="amount">${total_cost:,.0f}</div>
        </div>""", unsafe_allow_html=True)
    with c2:
        st.markdown(f"""
        <div class="budget-box" style="background:linear-gradient(135deg,#20878E,#92C4C6);">
            <div class="label">Hotel ({days} night{'s' if days > 1 else ''})</div>
            <div class="amount">${nightly * days:,.0f}</div>
        </div>""", unsafe_allow_html=True)
    with c3:
        st.markdown(f"""
        <div class="budget-box" style="background:linear-gradient(135deg,#92C4C6,#F3C375);color:#1a1a1a;">
            <div class="label">Activities & Food</div>
            <div class="amount" style="color:#1a1a1a;">${act_sum:,.0f}</div>
        </div>""", unsafe_allow_html=True)
    with c4:
        st.markdown(f"""
        <div class="budget-box" style="background:linear-gradient(135deg,#F3C375,#D66F29);">
            <div class="label">Daily Misc & Transport</div>
            <div class="amount">${misc_total:,.0f}</div>
        </div>""", unsafe_allow_html=True)

def render_info_strips(selected_day, fc_cond, fc_temp, total_km):
    icon = weather_icon(fc_cond)
    rain_note = " · Rain expected" if fc_cond in ["Rain", "Drizzle", "Thunderstorm"] else ""
    w_col, d_col = st.columns(2)
    with w_col:
        st.markdown(f"""
        <div class="info-strip">
            <span style="font-size:2rem;">{icon}</span>
            <div>
                <div class="label">Weather — {selected_day}</div>
                <div class="value">{fc_cond} · {fc_temp}°C{rain_note}</div>
            </div>
        </div>
        """, unsafe_allow_html=True)
    with d_col:
        st.markdown(f"""
        <div class="info-strip" style="border-left-color:#20878E;">
            <span style="font-size:2rem;">🚗</span>
            <div>
                <div class="label">Est. Travel Distance</div>
                <div class="value">{total_km:.1f} km for {selected_day}</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

def render_schedule_card(row):
    slot_emoji = row['slot'].split(" ")[-1] if " " in row['slot'] else "📌"
    slot_label = row['slot'].split(" ")[0] if " " in row['slot'] else row['slot']
    cat_class = "hotel" if row['category'] == 'Hotel' else "food" if row['category'] == 'Food' else "sight"
    cat_color = "#D66F29" if row['category'] == 'Hotel' else "#c8860a" if row['category'] == 'Food' else "#20878E"
    cost_str = "Free" if row['cost'] == 0 else f"${row['cost']}"
    st.markdown(f"""
    <div class="schedule-card {cat_class}">
        <div class="sc-emoji">{slot_emoji}</div>
        <div style="flex:1;">
            <div class="sc-name">{row['name']}</div>
            <div class="sc-meta">
                {slot_label}
                <span class="sc-pill" style="background:{cat_color}22;color:{cat_color};">{row['category']}</span>
            </div>
        </div>
        <div class="sc-cost">{cost_str}</div>
    </div>
    """, unsafe_allow_html=True)

def render_map_legend():
    st.markdown("""
    <div style="display:flex;gap:1.4rem;margin-top:0.5rem;flex-wrap:wrap;font-size:0.85rem;color:#444;">
        <span><span style="background:#D66F29;color:white;border-radius:50%;padding:1px 7px;">H</span> Hotel</span>
        <span><span style="background:#c8860a;color:white;border-radius:50%;padding:1px 7px;">1</span> Food stop</span>
        <span><span style="background:#20878E;color:white;border-radius:50%;padding:1px 7px;">1</span> Sightseeing stop</span>
        <span style="color:#888;">Numbers = unique stop order across the whole trip</span>
    </div>
    """, unsafe_allow_html=True)

def render_section_title(text, extra_style=""):
    st.markdown(f'<div class="section-title" style="{extra_style}">{text}</div>', unsafe_allow_html=True)

def make_map_marker(color, label):
    return folium.DivIcon(
        html=f"""<div style="background-color:{color};color:white;border-radius:50%;
            width:30px;height:30px;display:flex;align-items:center;justify-content:center;
            border:2px solid white;font-weight:700;font-size:12px;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);">{label}</div>""",
        icon_size=(30, 30),
        icon_anchor=(15, 15)
    )
