import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient("mongodb+srv://prescopadin_db_user:xDONJ7pN2Qzb1Qu1@cluster0.wrl4qxc.mongodb.net/?appName=Cluster0")
    db = client["prescopad"]
    clinics = await db.clinics.find().to_list(10)
    for c in clinics:
        print(c.get("name"))

if __name__ == "__main__":
    asyncio.run(check())
