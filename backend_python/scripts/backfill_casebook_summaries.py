"""One-off backfill for the Casebook feature.

What this script does:
1. Iterates every non-deleted patient across all clinics.
2. Rebuilds `casebook_summary` / `casebook_entries` from their existing
   finalized prescriptions using the same template logic used at
   prescription-finalize time (app.services.data_service.regenerate_casebook_summary).
3. Patients created before the Casebook feature existed never had this field
   populated — this script derives it purely from already-stored prescription
   data, so nothing is invented or lost.

Run:
    python -m scripts.backfill_casebook_summaries            # apply
    python -m scripts.backfill_casebook_summaries --dry-run  # report only
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Allow running from anywhere — add the backend_python folder to sys.path.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import database  # noqa: E402
from app.services.data_service import regenerate_casebook_summary  # noqa: E402


async def main(dry_run: bool):
    await database.connect_db()
    db = database.get_db()

    print(f"=== Casebook backfill ({'DRY RUN' if dry_run else 'APPLY'}) ===")

    total = 0
    updated = 0
    skipped_no_visits = 0

    async for patient in db.patients.find({"is_deleted": {"$ne": True}}):
        total += 1
        patient_id = str(patient["_id"])
        clinic_id = patient.get("clinic_id")
        if not clinic_id:
            continue

        if dry_run:
            prescriptions = await db.prescriptions.find({
                "clinic_id": clinic_id,
                "patient_id": patient_id,
                "is_deleted": {"$ne": True},
                "status": "finalized",
            }).to_list(length=None)
            if prescriptions:
                updated += 1
            else:
                skipped_no_visits += 1
            continue

        entries = await regenerate_casebook_summary(clinic_id, patient_id)
        if entries:
            updated += 1
        else:
            skipped_no_visits += 1

    print(f"Patients scanned: {total}")
    print(f"Casebook {'would be ' if dry_run else ''}populated: {updated}")
    print(f"Skipped (no finalized visits): {skipped_no_visits}")
    print("Done.")
    await database.close_db()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Report without writing")
    args = p.parse_args()
    asyncio.run(main(args.dry_run))
