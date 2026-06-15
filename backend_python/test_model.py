import asyncio
from app.models.user import CompleteRegistrationRequest

def test_model():
    data = {"clinicName": "Pratik Clinic", "name": "Pratik"}
    req = CompleteRegistrationRequest(**data)
    print("req.clinicName =", req.clinicName)
    print("req.clinic_name =", req.clinic_name)
    norm = req.normalized()
    print("norm =", norm)

if __name__ == "__main__":
    test_model()
