import unittest
import time
from datetime import datetime, timezone, timedelta
from app.services.otp_service import (
    validate_indian_phone,
    generate_secure_otp,
    hash_otp_securely,
    InMemoryOtpStore,
)

class TestOtpService(unittest.TestCase):
    def test_phone_validation(self):
        # Valid cases
        self.assertEqual(validate_indian_phone("9876543210"), "9876543210")
        self.assertEqual(validate_indian_phone("+919876543210"), "9876543210")
        self.assertEqual(validate_indian_phone("919876543210"), "9876543210")
        
        # Invalid cases
        with self.assertRaises(ValueError):
            validate_indian_phone("12345")
        with self.assertRaises(ValueError):
            validate_indian_phone("98765432101")
        with self.assertRaises(ValueError):
            validate_indian_phone("")

    def test_otp_generation(self):
        for _ in range(100):
            otp = generate_secure_otp()
            self.assertEqual(len(otp), 6)
            self.assertTrue(otp.isdigit())
            self.assertGreaterEqual(int(otp), 100000)
            self.assertLessEqual(int(otp), 999999)

    def test_otp_hashing(self):
        otp = "123456"
        h1 = hash_otp_securely(otp)
        h2 = hash_otp_securely(otp)
        self.assertEqual(h1, h2)
        self.assertNotEqual(h1, otp)

    def test_in_memory_store_flow(self):
        # We instantiate a store with 1 second cooldown for fast testing
        store = InMemoryOtpStore(ttl_minutes=1, cooldown_seconds=1, max_resends_per_hour=2)
        phone = "9876543210"
        purpose = "login"
        otp_hash = hash_otp_securely("123456")

        # Get non-existent
        self.assertIsNone(store.get(phone, purpose))

        # Check resend allowed initially
        allowed, rem = store.check_resend_cooldown(phone, purpose)
        self.assertTrue(allowed)
        self.assertEqual(rem, 0)

        # Create
        store.create_or_update(phone, purpose, otp_hash)
        entry = store.get(phone, purpose)
        self.assertIsNotNone(entry)
        self.assertEqual(entry["otp_hash"], otp_hash)
        self.assertEqual(entry["attempts"], 0)
        self.assertEqual(entry["resend_count"], 1)

        # Cooldown check immediately after
        allowed, rem = store.check_resend_cooldown(phone, purpose)
        self.assertFalse(allowed)
        self.assertGreater(rem, 0)

        # Wait for cooldown to pass
        time.sleep(1.1)
        allowed, rem = store.check_resend_cooldown(phone, purpose)
        self.assertTrue(allowed)

        # Resend OTP (update)
        new_hash = hash_otp_securely("654321")
        store.create_or_update(phone, purpose, new_hash)
        entry = store.get(phone, purpose)
        self.assertEqual(entry["otp_hash"], new_hash)
        self.assertEqual(entry["resend_count"], 2)

        # Cooldown check immediately
        allowed, rem = store.check_resend_cooldown(phone, purpose)
        self.assertFalse(allowed)

        # Wait for cooldown
        time.sleep(1.1)
        # Should now be blocked by hourly cap (max 2 resends per hour)
        allowed, rem = store.check_resend_cooldown(phone, purpose)
        self.assertFalse(allowed)
        self.assertEqual(rem, -1) # hourly limit code

        # Attempts incrementing
        self.assertEqual(store.increment_attempts(phone, purpose), 1)
        self.assertEqual(store.increment_attempts(phone, purpose), 2)
        self.assertEqual(store.get(phone, purpose)["attempts"], 2)

        # Remove
        store.remove(phone, purpose)
        self.assertIsNone(store.get(phone, purpose))

    def test_in_memory_store_expiry(self):
        # 1-second TTL for testing
        store = InMemoryOtpStore(ttl_minutes=0.0001, cooldown_seconds=1) 
        # Set expire time explicitly backwards so we don't have to wait
        phone = "9876543210"
        purpose = "login"
        otp_hash = hash_otp_securely("123456")
        
        store.create_or_update(phone, purpose, otp_hash)
        entry = store.store[(phone, purpose)]
        entry["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        
        # Retrieval should now return None and purge
        self.assertIsNone(store.get(phone, purpose))
        self.assertNotIn((phone, purpose), store.store)

if __name__ == "__main__":
    unittest.main()
