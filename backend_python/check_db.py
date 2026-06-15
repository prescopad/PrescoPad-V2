import pymongo
import json
from bson import json_util

client = pymongo.MongoClient("mongodb://localhost:27017/")
db = client["prescopad"]
clinics = list(db.clinics.find())
print("Clinics:")
for c in clinics:
    print(c.get("name"))

doctors = list(db.doctors.find())
print("Doctors:")
for d in doctors:
    print(f"Name: {d.get('name')}, Clinic ID: {d.get('clinic_id')}")
