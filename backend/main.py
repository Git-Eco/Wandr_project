from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from routers import trips, locations, profile, memories
import db


async def _keepalive_loop():
    """Ping Supabase every 4 minutes to prevent connection idle timeout."""
    while True:
        await asyncio.sleep(240)  # 4 minutes
        try:
            db.get_client().table("trips").select("id").limit(1).execute()
        except Exception:
            pass  # non-fatal — next real request will reconnect


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Warm up on startup ────────────────────────────────────────────────────
    # Pre-connect to Supabase and pre-load the locations cache so the first
    # real request doesn't pay the cold-start penalty.
    try:
        db.get_client()          # establish connection
        db.get_locations()       # prime the locations cache
        print("✅ Supabase connection warmed up, locations cached.")
    except Exception as e:
        print(f"⚠️  Startup warm-up failed (non-fatal): {e}")

    # Start keep-alive background task
    task = asyncio.create_task(_keepalive_loop())
    yield
    task.cancel()


app = FastAPI(title="Wandr API", version="1.0.0", lifespan=lifespan)

import os

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:4173",   # Vite preview
        # Add your Vercel URL here after deploying, e.g.:
        # "https://wandr-project.vercel.app",
        *([os.environ["FRONTEND_URL"]] if os.environ.get("FRONTEND_URL") else []),
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
