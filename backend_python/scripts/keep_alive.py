"""
keep_alive.py
=============
Run this script on any PC/server to keep your Render free-tier backend awake 24/7.
It pings your /api/health endpoint every 10 minutes.

Usage:
    python keep_alive.py

Or run in background (Windows):
    start /B pythonw keep_alive.py

Or schedule it via Windows Task Scheduler to auto-start on boot.
"""

import time
import urllib.request
import urllib.error
import datetime
import sys
import os

# ─── CONFIG ──────────────────────────────────────────────────────────────────
PING_URL = "https://prescopad-backend.onrender.com/api/health"
INTERVAL_SECONDS = 10 * 60  # 10 minutes — well within Render's 15-min idle window
LOG_FILE = "keep_alive.log"   # set to None to disable file logging
# ─────────────────────────────────────────────────────────────────────────────


def log(message: str):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {message}"
    print(line, flush=True)
    if LOG_FILE:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def ping():
    try:
        req = urllib.request.Request(PING_URL, headers={"User-Agent": "PrescoPad-KeepAlive/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
            log(f"✅ Ping OK — HTTP {status} — {PING_URL}")
            return True
    except urllib.error.HTTPError as e:
        log(f"⚠️  Ping got HTTP {e.code} — {PING_URL}")
        return False
    except Exception as e:
        log(f"❌ Ping FAILED — {e}")
        return False


def main():
    log("=" * 60)
    log("PrescoPad Keep-Alive Script Started")
    log(f"Pinging: {PING_URL}")
    log(f"Interval: {INTERVAL_SECONDS // 60} minutes")
    log("=" * 60)

    consecutive_failures = 0

    while True:
        success = ping()
        if not success:
            consecutive_failures += 1
            log(f"Consecutive failures: {consecutive_failures}")
        else:
            if consecutive_failures > 0:
                log(f"Recovered after {consecutive_failures} failure(s)")
            consecutive_failures = 0

        if consecutive_failures >= 5:
            log("⛔ 5 consecutive failures — server may be down. Waiting 5 min before retry.")
            time.sleep(5 * 60)
            consecutive_failures = 0  # reset counter
            continue

        log(f"   Next ping in {INTERVAL_SECONDS // 60} minutes...")
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Keep-alive script stopped by user.")
        sys.exit(0)
