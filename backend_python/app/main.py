import asyncio
import logging
from datetime import datetime, timezone, timedelta

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse
from bson import ObjectId

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

from app.config.database import connect_db, close_db
from app.config.settings import settings
from app.routes import (
    auth, wallet, clinic, connection, data,
    notification, analytics, admin,
)

KEEPALIVE_INTERVAL_SECONDS = 14 * 60  # 14 minutes — keeps Render free-tier awake
DRAFT_PURGE_INTERVAL_SECONDS = 6 * 60 * 60  # run every 6 hours


async def _keepalive_loop():
    """Ping our own /api/health every 14 minutes so Render never idles us out."""
    await asyncio.sleep(60)  # wait for server to fully start before first ping
    while True:
        try:
            base = f"http://localhost:{settings.PORT}"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{base}/api/health")
            log.info("Keep-alive ping: %s", resp.status_code)
        except Exception as exc:
            log.warning("Keep-alive ping failed: %s", exc)
        await asyncio.sleep(KEEPALIVE_INTERVAL_SECONDS)


async def _purge_stale_drafts_loop():
    """Delete draft prescriptions older than 24 h that were never finalized.

    These accumulate when a doctor opens ConsultScreen and exits without
    issuing a prescription. Running every 6 hours keeps the collection clean.
    """
    from app.config.database import get_db

    await asyncio.sleep(300)  # wait 5 minutes after startup before first run
    while True:
        try:
            db = get_db()
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            result = await db.prescriptions.delete_many({
                "status": "draft",
                "created_at": {"$lt": cutoff},
            })
            if result.deleted_count > 0:
                log.info("Purged %d stale draft prescription(s)", result.deleted_count)
        except Exception as exc:
            log.warning("Stale draft purge failed: %s", exc)
        await asyncio.sleep(DRAFT_PURGE_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    keepalive_task = asyncio.create_task(_keepalive_loop())
    purge_task = asyncio.create_task(_purge_stale_drafts_loop())
    yield
    keepalive_task.cancel()
    purge_task.cancel()
    await close_db()


app = FastAPI(
    title="PrescoPad API",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — never combine wildcard origin with credentials. If no specific allowed
# origins are configured, default to allowing all origins without credentials.
_origins = settings.allowed_origins_list
_allow_credentials = True
if not _origins or _origins == ["*"]:
    _origins = ["*"]
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router)
app.include_router(wallet.router)
app.include_router(clinic.router)
app.include_router(connection.router)
app.include_router(data.router)
app.include_router(notification.router)
app.include_router(analytics.router)
app.include_router(admin.router)


DOWNLOAD_LIMITS = {}


@app.get("/rx/{share_token}")
async def download_prescription(share_token: str, request: Request):
    # 1. Rate limiting by IP
    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    
    # Clean up old rate limit items
    for ip in list(DOWNLOAD_LIMITS.keys()):
        if now - DOWNLOAD_LIMITS[ip]["time"] > timedelta(minutes=1):
            DOWNLOAD_LIMITS.pop(ip, None)
            
    limits = DOWNLOAD_LIMITS.setdefault(client_ip, {"count": 0, "time": now})
    if now - limits["time"] > timedelta(minutes=1):
        limits["count"] = 0
        limits["time"] = now
        
    limits["count"] += 1
    if limits["count"] > 10:
        return HTMLResponse(
            content="<h3>Too many requests. Please try again in a minute.</h3>",
            status_code=429
        )
        
    # 2. Look up prescription by share_token
    from app.config.database import get_db
    db = get_db()
    rx = await db.prescriptions.find_one({"share_token": share_token, "is_deleted": {"$ne": True}})
    if not rx:
        return HTMLResponse(
            content="<h3>Link invalid or prescription not found.</h3>",
            status_code=404
        )
        
    # 3. Check expiry
    expires_at = rx.get("share_token_expires_at")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now:
            return HTMLResponse(
                content="""
                <html>
                <head>
                    <title>Prescription Expired</title>
                    <style>
                        body { font-family: Helvetica, Arial, sans-serif; text-align: center; padding-top: 100px; color: #333; }
                        h2 { color: #DC2626; }
                        p { font-size: 16px; color: #666; }
                    </style>
                </head>
                <body>
                    <h2>Prescription Link Expired</h2>
                    <p>This prescription download link has expired (valid for 7 days).</p>
                    <p>Please contact your clinic or doctor to resend the prescription.</p>
                </body>
                </html>
                """,
                status_code=400
            )
            
    # 4. Fetch clinic and doctor details
    clinic_doc = None
    doctor_doc = None
    if rx.get("clinic_id"):
        try:
            clinic_doc = await db.clinics.find_one({"_id": ObjectId(rx["clinic_id"])})
        except Exception:
            pass
    if rx.get("doctor_id"):
        try:
            doctor_doc = await db.doctors.find_one({"_id": ObjectId(rx["doctor_id"])})
        except Exception:
            pass
            
    # 5. Generate PDF in-memory
    from app.services.pdf_generator import generate_prescription_pdf
    try:
        pdf_bytes = await generate_prescription_pdf(rx, clinic_doc, doctor_doc)
    except Exception as e:
        log.error("Failed to generate PDF on the fly: %s", e)
        return HTMLResponse(
            content="<h3>Failed to generate prescription PDF. Please contact clinic support.</h3>",
            status_code=500
        )
        
    # 6. Stream the PDF
    import io
    filename = f"prescription_{rx['_id']}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@app.get("/api/health")
async def health():
    return {"success": True, "message": "PrescoPad API is running", "version": "2.0.0"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    exc_str = str(exc).lower()
    log.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if "connection pool paused" in exc_str or "autoreconnect" in exc_str or "serverselectiontimeout" in exc_str:
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "Database temporarily unavailable, please retry"},
        )
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error"},
    )
