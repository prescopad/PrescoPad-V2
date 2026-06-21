import asyncio
import logging
from bson import ObjectId
from datetime import datetime, timezone
from app.config.database import connect_db, close_db, get_db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("debug_rx")

async def run_debug():
    print("Connecting to database...")
    await connect_db()
    db = get_db()
    
    token = "ZMZw5Wa3gct5V2882FtnrTK9976SCNza"
    rx = await db.prescriptions.find_one({"share_token": token, "is_deleted": {"$ne": True}})
    if not rx:
        print("Prescription not found")
        await close_db()
        return
        
    expires_at = rx.get("share_token_expires_at")
    print(f"Value of expires_at: {expires_at}")
    print(f"Type of expires_at: {type(expires_at)}")
    
    try:
        if expires_at:
            if isinstance(expires_at, str):
                print("expires_at is a string!")
            else:
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                print("Successfully processed timezone logic!")
    except Exception as e:
        log.exception("Timezone logic failed:")
        
    await close_db()

if __name__ == "__main__":
    asyncio.run(run_debug())
