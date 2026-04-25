from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import trips, locations, profile, memories

app = FastAPI(title="Wandr API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:4173",   # Vite preview
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trips.router,    prefix="/trips",    tags=["trips"])
app.include_router(locations.router,prefix="/locations", tags=["locations"])
app.include_router(profile.router,  prefix="/profile",  tags=["profile"])
app.include_router(memories.router, prefix="/memories", tags=["memories"])

# Public share endpoint — mounted separately so it has no auth middleware
from routers.trips import get_shared_trip
from fastapi import APIRouter as _R
_share = _R()
_share.add_api_route("/share/{trip_id}", get_shared_trip, methods=["GET"], tags=["share"])

@app.get("/health")
def health():
    return {"status": "ok"}
