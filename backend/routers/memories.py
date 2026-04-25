from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import db
from dependencies import get_current_user_id

router = APIRouter()


class SaveMemoryRequest(BaseModel):
    trip_id: str
    day_num: int
    note: Optional[str] = ''
    image_url: Optional[str] = ''
    image_path: Optional[str] = ''


class UpdateMemoryRequest(BaseModel):
    note: Optional[str] = None
    image_url: Optional[str] = None
    image_path: Optional[str] = None


def _verify_trip_owner(trip_id: str, user_id: str):
    """Make sure the trip belongs to this user before touching its memories."""
    client = db.get_client()
    res = client.table("trips").select("id").eq("id", trip_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=403, detail="Trip not found or access denied.")


@router.get("/{trip_id}/{day_num}")
def get_memories(trip_id: str, day_num: int, user_id: str = Depends(get_current_user_id)):
    _verify_trip_owner(trip_id, user_id)
    client = db.get_client()
    res = (
        client.table("memories")
        .select("*")
        .eq("trip_id", trip_id)
        .eq("day_num", day_num)
        .order("created_at")
        .execute()
    )
    return res.data or []


@router.get("/{trip_id}")
def get_all_memories(trip_id: str, user_id: str = Depends(get_current_user_id)):
    _verify_trip_owner(trip_id, user_id)
    client = db.get_client()
    res = (
        client.table("memories")
        .select("*")
        .eq("trip_id", trip_id)
        .order("day_num")
        .execute()
    )
    return res.data or []


@router.post("")
def save_memory(body: SaveMemoryRequest, user_id: str = Depends(get_current_user_id)):
    _verify_trip_owner(body.trip_id, user_id)
    client = db.get_client()
    res = client.table("memories").insert({
        "trip_id":    body.trip_id,
        "day_num":    body.day_num,
        "note":       body.note or '',
        "image_url":  body.image_url or '',
        "image_path": body.image_path or '',
    }).execute()
    return res.data[0] if res.data else {}


@router.patch("/{memory_id}")
def update_memory(
    memory_id: str,
    body: UpdateMemoryRequest,
    user_id: str = Depends(get_current_user_id)
):
    client = db.get_client()
    # Verify ownership via trip
    mem = client.table("memories").select("trip_id").eq("id", memory_id).execute()
    if not mem.data:
        raise HTTPException(status_code=404, detail="Memory not found.")
    _verify_trip_owner(mem.data[0]["trip_id"], user_id)

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    res = client.table("memories").update(updates).eq("id", memory_id).execute()
    return res.data[0] if res.data else {}


@router.delete("/{memory_id}")
def delete_memory(memory_id: str, user_id: str = Depends(get_current_user_id)):
    client = db.get_client()
    mem = client.table("memories").select("trip_id, image_path").eq("id", memory_id).execute()
    if not mem.data:
        raise HTTPException(status_code=404, detail="Memory not found.")
    _verify_trip_owner(mem.data[0]["trip_id"], user_id)

    # If there's a stored image, remove it from Storage too
    image_path = mem.data[0].get("image_path", "")
    if image_path:
        try:
            client.storage.from_("memories").remove([image_path])
        except Exception:
            pass  # Don't block deletion if storage removal fails

    client.table("memories").delete().eq("id", memory_id).execute()
    return {"deleted": memory_id}
