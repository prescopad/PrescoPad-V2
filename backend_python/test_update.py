import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def test_update():
    client = AsyncIOMotorClient("mongodb+srv://prescopadin_db_user:xDONJ7pN2Qzb1Qu1@cluster0.wrl4qxc.mongodb.net/?appName=Cluster0")
    db = client["prescopad"]
    
    # Let's find Karan
    karan = await db.doctors.find_one({"name": "Karan"})
    if not karan:
        print("Karan not found")
        return
        
    print("Found Karan, clinic_id:", karan.get("clinic_id"))
    
    clinic_id = karan.get("clinic_id")
    if clinic_id:
        # Check current clinic
        clinic = await db.clinics.find_one({"_id": ObjectId(clinic_id)})
        print("Before update:", clinic.get("name") if clinic else "NOT FOUND")
        
        # Simulate update_one
        clinic_update = {"name": "Karan's Awesome Clinic"}
        res = await db.clinics.update_one(
            {"_id": ObjectId(clinic_id)},
            {"$set": clinic_update}
        )
        print("Modified count:", res.modified_count)
        
        # Check after update
        clinic_after = await db.clinics.find_one({"_id": ObjectId(clinic_id)})
        print("After update:", clinic_after.get("name"))

if __name__ == "__main__":
    asyncio.run(test_update())
