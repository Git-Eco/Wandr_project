# Project Structure

## File Organization

```
.
├── app.py              # Main application file (single-file architecture)
├── locations.csv       # Static location database
├── README.md           # Project documentation (minimal)
├── venv/               # Python virtual environment
└── .kiro/              # Kiro AI assistant configuration
    └── steering/       # AI guidance documents
```

## Code Architecture (app.py)

The application follows a functional, single-file structure organized into logical sections:

### 1. Core Functions
- `get_weather_status()`: Fetches weather data from OpenWeatherMap API
- `predict_total_budget()`: Uses linear regression to estimate trip costs
- `organize_itinerary()`: Distributes activities across days and time slots

### 2. Initialization & Data
- Streamlit page configuration
- Session state initialization (`all_trips`, `view`, `selected_trip`)
- CSV data loading with caching

### 3. View Functions
- `show_dashboard()`: Trip gallery with create/select options
- `trip_creator_dialog()`: Modal dialog for new trip creation
- `show_details()`: Detailed trip view with map, itinerary, and weather tabs

### 4. Main Controller
- Simple view router based on `st.session_state.view`

## Data Model

### Session State
- `all_trips`: List of trip dictionaries
- `view`: Current screen ("dashboard" or "details")
- `selected_trip`: Currently viewed trip object

### Trip Object Structure
```python
{
    "city": str,
    "plan_df": DataFrame,  # Organized itinerary
    "cost": float,
    "weather": {"condition": str, "temp": float},
    "days": int
}
```

## Conventions

- Single-file application (no module separation)
- Streamlit dialogs for modal interactions
- Session state for data persistence
- Functional programming style (no classes)
- Inline comments with section markers (e.g., `# --- 1. CORE FUNCTIONS ---`)
