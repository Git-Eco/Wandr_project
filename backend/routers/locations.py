from fastapi import APIRouter, Depends
import db
from dependencies import get_current_user_id

router = APIRouter()

@router.get("")
def list_locations(user_id: str = Depends(get_current_user_id)):
    df = db.get_locations()
    if df.empty:
        return []
    return df.to_dict("records")
