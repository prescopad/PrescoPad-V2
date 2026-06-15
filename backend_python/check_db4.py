import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def check():
    client = AsyncIOMotorClient("mongodb+srv://prescopadin_db_user:xDONJ7pN2Qzb1Qu1@cluster0.wrl4qxc.mongodb.net/?appName=Cluster0")
    db = client["prescopad"]
    doctors = await db.doctors.find().to_list(10)
    for d in doctors:
        cid = d.get("clinic_id")
        print("Doctor:", d.get("name"), "Clinic ID:", cid)
        if cid:
            clinic = await db.clinics.find_one({"_id": ObjectId(cid)})
            print("Clinic DB Name:", clinic.get("name") if clinic else "NOT FOUND")

if __name__ == "__main__":
    asyncio.run(check())
