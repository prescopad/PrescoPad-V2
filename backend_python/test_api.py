from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_api():
    # Login to get token
    # Wait, we can't easily login without OTP
    pass
