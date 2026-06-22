import hmac
import hashlib
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Dict, Tuple, Optional
import httpx
from app.config.settings import settings

log = logging.getLogger(__name__)

RENFLAIR_BASE_URL = "https://sms.renflair.in/V1.php"


def validate_indian_phone(phone: str) -> str:
    """Validate and format 10-digit Indian phone number.
    Strips +91 or 91 prefixes and ensures exactly 10 digits.
    """
    if not phone:
        raise ValueError("Phone number cannot be empty")
        
    # Strip whitespace and non-numeric characters
    clean = "".join(c for c in phone if c.isdigit())
    
    # Strip leading +91 or 91 if present and length allows it
    if phone.startswith("+91"):
        clean = "".join(c for c in phone[3:] if c.isdigit())
    elif clean.startswith("91") and len(clean) == 12:
        clean = clean[2:]
        
    if len(clean) != 10:
        raise ValueError("Invalid phone number. Must be a 10-digit Indian mobile number.")
        
    return clean


def generate_secure_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP.
    Generates a number between 100000 and 999999 to guarantee 
    that no leading zeros are truncated by carrier systems.
    """
    return str(secrets.randbelow(900000) + 100000)


def hash_otp_securely(otp: str) -> str:
    """Generates a secure HMAC-SHA256 hash of the OTP using JWT_SECRET as salt."""
    secret = settings.JWT_SECRET or "default-prescopad-otp-salt"
    return hmac.new(secret.encode(), otp.encode(), hashlib.sha256).hexdigest()


class InMemoryOtpStore:
    def __init__(self, ttl_minutes: int = 5, cooldown_seconds: int = 60, max_resends_per_hour: int = 5):
        self.store: Dict[Tuple[str, str], dict] = {}
        self.ttl = ttl_minutes
        self.cooldown = cooldown_seconds
        self.max_resends = max_resends_per_hour

    def _get_key(self, phone: str, purpose: str) -> Tuple[str, str]:
        return (phone, purpose)

    def get(self, phone: str, purpose: str) -> Optional[dict]:
        """Retrieve OTP entry if it exists and has not expired."""
        key = self._get_key(phone, purpose)
        entry = self.store.get(key)
        if not entry:
            return None
        
        # Check TTL expiry
        if datetime.now(timezone.utc) > entry["expires_at"]:
            self.store.pop(key, None)
            return None
        return entry

    def check_resend_cooldown(self, phone: str, purpose: str) -> Tuple[bool, int]:
        """Check if resend is allowed. Returns (allowed: bool, remaining_seconds: int)"""
        entry = self.get(phone, purpose)
        if not entry:
            return True, 0
            
        now = datetime.now(timezone.utc)
        elapsed = (now - entry["last_resend_at"]).total_seconds()
        if elapsed < self.cooldown:
            return False, int(self.cooldown - elapsed)
            
        # Check hourly resend limit
        if now - entry["last_resend_at"] > timedelta(hours=1):
            # Safe to reset
            entry["resend_count"] = 0
            
        if entry["resend_count"] >= self.max_resends:
            return False, -1 # hourly cap reached
            
        return True, 0

    def create_or_update(self, phone: str, purpose: str, otp_hash: str) -> dict:
        """Create or update OTP verification entry."""
        key = self._get_key(phone, purpose)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=self.ttl)
        
        entry = self.store.get(key)
        if entry and now <= entry["expires_at"]:
            # Update existing entry
            entry["otp_hash"] = otp_hash
            entry["expires_at"] = expires_at
            entry["attempts"] = 0
            
            # Reset resend count if an hour has passed since the window started
            if now - entry["window_start_at"] > timedelta(hours=1):
                entry["resend_count"] = 1
                entry["window_start_at"] = now
            else:
                entry["resend_count"] += 1
                
            entry["last_resend_at"] = now
        else:
            # Create a brand new entry
            entry = {
                "otp_hash": otp_hash,
                "created_at": now,
                "expires_at": expires_at,
                "attempts": 0,
                "resend_count": 1,
                "last_resend_at": now,
                "window_start_at": now,
            }
            self.store[key] = entry
        return entry

    def increment_attempts(self, phone: str, purpose: str) -> int:
        """Increment attempt count for checking. Returns new attempt count."""
        entry = self.get(phone, purpose)
        if entry:
            entry["attempts"] += 1
            return entry["attempts"]
        return 0

    def remove(self, phone: str, purpose: str):
        """Remove entry from store on successful verification or lockout."""
        key = self._get_key(phone, purpose)
        self.store.pop(key, None)


# Global instance of OTP store — reads rate-limit cap from settings
otp_store = InMemoryOtpStore(max_resends_per_hour=settings.OTP_REQUESTS_PER_HOUR)


async def send_otp_via_renflair(phone_number: str, otp: str) -> dict:
    """Send OTP via Renflair API with single retry policy on network failure."""
    if settings.OTP_DEMO_MODE:
        log.info("OTP DEMO MODE ACTIVE: Dummy OTP %s not sent to %s", otp, phone_number)
        return {"status": "SUCCESS", "message": "Demo mode: SMS sent successfully."}

    if not settings.RENFLAIR_API_KEY:
        log.error("Renflair API key is not configured in settings")
        raise ValueError("SMS provider is not configured")

    params = {
        "API": settings.RENFLAIR_API_KEY,
        "PHONE": phone_number,
        "OTP": otp,
    }

    # Log request details (masking API key for security)
    masked_key = settings.RENFLAIR_API_KEY[:4] + "..." + settings.RENFLAIR_API_KEY[-4:] if len(settings.RENFLAIR_API_KEY) > 8 else "..."
    log.info(
        "Initiating SMS OTP request: URL=%s, Masked API Key=%s, Phone=%s, OTP=%s",
        RENFLAIR_BASE_URL,
        masked_key,
        phone_number,
        otp
    )

    # Retry policy: 1 retry on connection/network timeout
    max_retries = 2
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                log.info("Sending GET request to Renflair API (Attempt %d/%d)...", attempt, max_retries)
                response = await client.get(RENFLAIR_BASE_URL, params=params)
                
                # Log raw response details
                log.info("Renflair API raw response: Status Code=%d", response.status_code)
                log.info("Renflair API raw content: %s", response.text)
                
                response.raise_for_status()
                
                # Try parsing as JSON first
                try:
                    resp_json = response.json()
                    status = resp_json.get("status")
                    message = resp_json.get("message", "No message provided")
                except Exception as json_err:
                    log.warning("Response is not JSON format: %s. Attempting fallback text parsing.", json_err)
                    # Fallback text check
                    raw_text = response.text.upper()
                    if "SUCCESS" in raw_text:
                        status = "SUCCESS"
                        message = "SMS sent successfully (parsed from raw text)"
                    else:
                        status = "ERROR"
                        message = response.text
                
                if status == "SUCCESS":
                    log.info("OTP sent successfully to %s on attempt %d: %s", phone_number, attempt, message)
                    return {"status": "SUCCESS", "message": message}
                else:
                    log.warning("Renflair API error response status: %s, message: %s", status, message)
                    raise ValueError(message)
        except (httpx.HTTPError, httpx.NetworkError) as e:
            log.warning("Renflair connection attempt %d/%d failed: %s", attempt, max_retries, e)
            if attempt == max_retries:
                raise ValueError("SMS delivery failed due to network connectivity issues.")
        except Exception as e:
            log.error("Error during SMS send: %s", e)
            if attempt == max_retries:
                raise ValueError(f"SMS send failed: {str(e)}")

