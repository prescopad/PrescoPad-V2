from datetime import datetime, timedelta, timezone
from typing import Optional


class RateLimitError(ValueError):
    """Raised when an OTP request is blocked by rate limiting."""

from bson import ObjectId

from app.config.database import get_db, get_user_collection
from app.config.settings import settings
from app.utils.hash import (
    hash_password, verify_password,
    generate_doctor_code,
)
from app.services.otp_service import (
    otp_store,
    send_otp_via_renflair,
    hash_otp_securely,
    generate_secure_otp,
    validate_indian_phone,
)
from app.utils.jwt import create_access_token, create_refresh_token, verify_refresh_token, make_token_payload
from app.models.common import serialize_doc


async def send_otp(phone: str, role: str, purpose: str = "login") -> dict:
    # Format and validate Indian phone number
    phone = validate_indian_phone(phone)

    db = get_db()
    col = get_user_collection(db, role)
    user = await col.find_one({"phone": phone})

    # If a doctor-role request doesn't find the user in doctors, check admins.
    # This lets admins log in seamlessly via the Doctor login screen.
    if user is None and role == "doctor":
        admin_user = await db.admins.find_one({"phone": phone})
        if admin_user:
            col = db.admins
            role = "admin"
            user = admin_user

    # Rate-limit OTP requests per phone+purpose using the in-memory store.
    allowed, remaining = otp_store.check_resend_cooldown(phone, purpose)
    if not allowed:
        if remaining == -1:
            raise RateLimitError("You've requested too many OTPs. Please wait an hour before trying again.")
        else:
            raise RateLimitError(f"Please wait {remaining} seconds before requesting another OTP.")

    otp = generate_secure_otp()
    otp_hash = hash_otp_securely(otp)

    # Call the SMS service
    await send_otp_via_renflair(phone, otp)

    # Update in-memory OTP store
    otp_store.create_or_update(phone, purpose, otp_hash)

    if not user:
        doctor_code = None
        if role == "doctor":
            doctor_code = await _unique_doctor_code(db)

        user_doc = {
            "phone": phone,
            "role": role,
            "name": None,
            "specialty": None,
            "reg_number": None,
            "password_hash": None,
            "otp_hash": None,
            "otp_expires_at": None,
            "otp_attempts": 0,
            "otp_request_count": 0,
            "otp_window_start_at": None,
            "clinic_id": None,
            "doctor_code": doctor_code,
            "is_profile_complete": False,
            "is_active": True,
            "last_active_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await col.insert_one(user_doc)
        user_id = str(result.inserted_id)

        if role == "doctor":
            clinic_doc = {
                "name": f"Dr. Clinic ({phone})",
                "address": None,
                "phone": phone,
                "email": None,
                "logo_url": None,
                "owner_id": user_id,
                "solo_mode": True,  # default — flips to False when an assistant joins
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            clinic_result = await db.clinics.insert_one(clinic_doc)
            clinic_id = str(clinic_result.inserted_id)
            await col.update_one(
                {"_id": result.inserted_id},
                {"$set": {"clinic_id": clinic_id}}
            )

            wallet_doc = {
                "user_id": user_id,
                "balance": 100.0,
                "auto_refill": False,
                "auto_refill_amount": None,
                "auto_refill_threshold": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            await db.wallets.insert_one(wallet_doc)
    else:
        await col.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "updated_at": datetime.now(timezone.utc),
            }}
        )

    return {"message": "OTP sent successfully"}


async def verify_otp_and_login(phone: str, otp: str, role: str, purpose: str = "login") -> dict:
    phone = validate_indian_phone(phone)

    entry = otp_store.get(phone, purpose)
    if not entry:
        raise ValueError("This OTP has expired or is no longer valid. Please request a new one.")

    db = get_db()
    col = get_user_collection(db, role)
    user = await col.find_one({"phone": phone})

    # If a doctor-role request doesn't find the user in doctors, check admins.
    if user is None and role == "doctor":
        admin_user = await db.admins.find_one({"phone": phone})
        if admin_user:
            col = db.admins
            role = "admin"
            user = admin_user

    input_hash = hash_otp_securely(otp)
    if input_hash == entry["otp_hash"]:
        # Success, clear store
        otp_store.remove(phone, purpose)

        if not user:
            raise ValueError("Account setup is incomplete. Please request a new OTP to register.")

        await col.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "last_active_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }}
        )

        user = await col.find_one({"_id": user["_id"]})
        return await _build_auth_response(user)
    else:
        attempts = otp_store.increment_attempts(phone, purpose)
        if attempts >= settings.OTP_MAX_VERIFY_ATTEMPTS:
            otp_store.remove(phone, purpose)
            raise ValueError("Too many incorrect attempts. Please request a new OTP and try again.")

        remaining = settings.OTP_MAX_VERIFY_ATTEMPTS - attempts
        attempt_word = "attempt" if remaining == 1 else "attempts"
        raise ValueError(f"Incorrect OTP. You have {remaining} {attempt_word} remaining.")


async def login_with_password(phone: str, password: str, role: str) -> dict:
    db = get_db()
    col = get_user_collection(db, role)
    user = await col.find_one({"phone": phone})
    if not user:
        raise ValueError("Invalid credentials")

    if not user.get("password_hash"):
        # No password set yet — account not fully registered, must use OTP
        raise ValueError("No password set. Please login with OTP.")

    if not verify_password(password, user["password_hash"]):
        raise ValueError("Invalid credentials")

    await col.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_active_at": datetime.now(timezone.utc)}}
    )
    user = await col.find_one({"_id": user["_id"]})
    return await _build_auth_response(user)


async def refresh_token(refresh_token_str: str) -> dict:
    payload = verify_refresh_token(refresh_token_str)
    if not payload:
        raise ValueError("Invalid refresh token")

    db = get_db()
    role = payload.get("role")
    if not role:
        raise ValueError("Invalid token payload")
    col = get_user_collection(db, role)
    user = await col.find_one({"_id": ObjectId(payload["userId"])})
    if not user or not user.get("is_active"):
        raise ValueError("User not found or inactive")

    return await _build_auth_response(user)


async def complete_registration(user_id: str, role: str, data: dict) -> dict:
    db = get_db()
    col = get_user_collection(db, role)
    update = {
        "name": data.get("name"),
        "is_profile_complete": True,
        "updated_at": datetime.now(timezone.utc),
    }
    user = await col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise ValueError("User not found")

    if user["role"] == "doctor":
        update["specialty"] = data.get("specialty")
        update["reg_number"] = data.get("reg_number")
        if data.get("password"):
            update["password_hash"] = hash_password(data["password"])

        # Update clinic details if provided
        clinic_update: dict = {}
        c_name = data.get("clinic_name") or data.get("clinicName")
        if c_name:
            clinic_update["name"] = c_name
        c_address = data.get("clinic_address") or data.get("clinicAddress")
        if c_address:
            clinic_update["address"] = c_address
        c_phone = data.get("clinic_phone") or data.get("clinicPhone")
        if c_phone:
            clinic_update["phone"] = c_phone
        c_email = data.get("clinic_email") or data.get("clinicEmail")
        if c_email:
            clinic_update["email"] = c_email
        if clinic_update and user.get("clinic_id"):
            clinic_update["updated_at"] = datetime.now(timezone.utc)
            await db.clinics.update_one(
                {"_id": ObjectId(user["clinic_id"])},
                {"$set": clinic_update},
            )
    else:
        update["specialty"] = data.get("qualification")
        update["experience_years"] = data.get("experience_years")
        update["city"] = data.get("city")
        update["address"] = data.get("address")
        if data.get("password"):
            update["password_hash"] = hash_password(data["password"])

    await col.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    user = await col.find_one({"_id": ObjectId(user_id)})
    return serialize_doc(user)


async def _with_solo_mode(user_data: dict, clinic_id) -> dict:
    """Attach clinic.solo_mode to a serialized user dict so the frontend can
    show/hide the doctor's patient-management tab consistently across both
    /auth/me and the login response."""
    if clinic_id:
        try:
            db = get_db()
            clinic = await db.clinics.find_one({"_id": ObjectId(clinic_id)})
            if clinic:
                user_data["solo_mode"] = bool(clinic.get("solo_mode", False))
        except Exception:
            pass
    return user_data


async def get_me(user_id: str, role: str) -> dict:
    db = get_db()
    col = get_user_collection(db, role)
    user = await col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise ValueError("User not found")
    data = serialize_doc(user)
    data.pop("password_hash", None)
    data.pop("otp_hash", None)
    return await _with_solo_mode(data, user.get("clinic_id"))


async def update_profile(user_id: str, role: str, data: dict) -> dict:
    db = get_db()
    col = get_user_collection(db, role)

    # If phone is being changed, ensure no other user of same role has it
    new_phone = data.get("phone")
    if new_phone:
        existing = await col.find_one({"phone": new_phone, "_id": {"$ne": ObjectId(user_id)}})
        if existing:
            raise ValueError("Phone number is already registered to another account.")

    update = {k: v for k, v in data.items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc)
    await col.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    user = await col.find_one({"_id": ObjectId(user_id)})
    return serialize_doc(user)


async def heartbeat(user_id: str, role: str):
    db = get_db()
    col = get_user_collection(db, role)
    await col.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"last_active_at": datetime.now(timezone.utc)}}
    )


async def refresh_session(user_id: str, role: str) -> dict:
    db = get_db()
    col = get_user_collection(db, role)
    user = await col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise ValueError("User not found")
    return await _build_auth_response(user)


async def _build_auth_response(user: dict) -> dict:
    user_id = str(user["_id"])
    payload = make_token_payload(user_id, user["role"], user["phone"], user.get("clinic_id"))
    access_token = create_access_token(payload)
    refresh_token_str = create_refresh_token(payload)

    user_data = serialize_doc(dict(user))
    user_data.pop("otp_hash", None)
    user_data.pop("password_hash", None)
    user_data.pop("otp_attempts", None)
    user_data.pop("otp_request_count", None)
    user_data.pop("otp_window_start_at", None)

    # Enrich with clinic.solo_mode so the frontend can adapt UI without a second call.
    user_data = await _with_solo_mode(user_data, user.get("clinic_id"))

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "user": user_data,
    }


async def _unique_doctor_code(db) -> str:
    while True:
        code = generate_doctor_code()
        existing = await db.doctors.find_one({"doctor_code": code})
        if not existing:
            return code
