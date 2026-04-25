from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import db
from dependencies import get_current_user_id

router = APIRouter()

ALL_PREFERENCES = ['Sightseeing', 'Culture', 'Nature', 'History', 'Art', 'Food']

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    preferences: Optional[list[str]] = None


@router.get("")
def get_profile(user_id: str = Depends(get_current_user_id)):
    client = db.get_client()
    res = client.table("profiles").select("*").eq("id", user_id).execute()
    if res.data:
        return res.data[0]
    # Auto-create if missing (for existing users)
    client.table("profiles").insert({"id": user_id}).execute()
    return {"id": user_id, "name": "", "preferences": []}


@router.patch("")
def update_profile(body: UpdateProfileRequest, user_id: str = Depends(get_current_user_id)):
    client = db.get_client()
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.preferences is not None:
        valid = [p for p in body.preferences if p in ALL_PREFERENCES]
        updates["preferences"] = valid
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    res = client.table("profiles").update(updates).eq("id", user_id).execute()
    return res.data[0] if res.data else {}


@router.delete("")
def delete_account(user_id: str = Depends(get_current_user_id)):
    client = db.get_client()
    # Delete all trips + spots (cascade handles spots)
    client.table("trips").delete().eq("user_id", user_id).execute()
    # Delete profile row
    client.table("profiles").delete().eq("id", user_id).execute()
    # Delete the actual auth user — requires service role key
    try:
        client.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not delete auth user: {e}")
    return {"deleted": user_id}
