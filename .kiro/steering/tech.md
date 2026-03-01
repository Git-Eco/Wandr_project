# Technology Stack

## Framework & Libraries

- **Streamlit**: Web application framework (multi-page app with session state)
- **Pandas**: Data manipulation and CSV handling
- **NumPy**: Numerical operations
- **Folium**: Interactive map generation
- **streamlit-folium**: Streamlit-Folium integration
- **scikit-learn**: Machine learning (LinearRegression for budget prediction)
- **requests**: HTTP requests for weather API

## External APIs

- **OpenWeatherMap API**: Real-time weather data (API key: `d572bff0064eb6c677271a9e9cde858d`)

## Data Sources

- `locations.csv`: Static dataset containing tourist locations with coordinates, categories, types (Indoor/Outdoor), and costs

## Environment

- Python virtual environment (`venv/`)
- No requirements.txt file present (dependencies should be documented)

## Common Commands

```bash
# Activate virtual environment
venv\Scripts\activate  # Windows
source venv/bin/activate  # Unix/Mac

# Run the application
streamlit run app.py

# Install dependencies (manual - no requirements.txt)
pip install streamlit pandas numpy folium streamlit-folium requests scikit-learn
```

## Development Notes

- Application uses Streamlit's session state for trip persistence
- Weather API calls are made on-demand during trip creation
- Data is cached using `@st.cache_data` decorator
