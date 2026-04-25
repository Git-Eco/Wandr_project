from fastapi import Header, HTTPException
import db

async def get_current_user_id(authorization: str = Header(...)) -> str:
    """
    Extracts and verifies the Supabase JWT from the Authorization header.
    Returns the authenticated user's ID.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format.")
    token = authorization[7:]
    try:
        result = db.get_user_from_token(token)
        if result and result.user:
            return result.user.id
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Could not validate credentials: {e}")
