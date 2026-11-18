"""
Test script for Employee Verification, Login & IP capture, and Live Screen Wall feeds.
"""
import urllib.request
import urllib.error
import json

SERVER_URL = "http://127.0.0.1:8055"

def test_flow():
    print("1. Testing Employee Verification by ID (9310790241)...")
    res = urllib.request.urlopen(f"{SERVER_URL}/api/employee/verify/9310790241")
    data = json.loads(res.read().decode('utf-8'))
    assert data["success"] is True
    emp = data["employee"]
    print(f"   [OK] Name: {emp['name']}, Dept: {emp['department']}, Status: {emp['status']}")
    assert emp["name"] == "Pratham sharma"
    assert emp["department"] == "Anuvadini foundation"

    print("2. Testing Employee Login Authentication with Password (9310790241)...")
    login_payload = {
        "employee_id": "9310790241",
        "password": "9310790241",
        "hostname": "HQ-ANUVADINI-01",
        "ip_address": "192.168.1.150"
    }
    req = urllib.request.Request(
        f"{SERVER_URL}/api/employee/login",
        data=json.dumps(login_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    res = urllib.request.urlopen(req)
    login_data = json.loads(res.read().decode('utf-8'))
    assert login_data["success"] is True
    print(f"   [OK] Logged in: {login_data['message']}")
    print(f"   [OK] IP Captured: {login_data['client_ip']}")
    assert login_data["name"] == "Pratham sharma"

    print("3. Testing Live Screen Feed Endpoint for HQ-ANUVADINI-01...")
    res = urllib.request.urlopen(f"{SERVER_URL}/api/fleet/live-screen/HQ-ANUVADINI-01")
    assert res.headers.get("Content-Type") == "image/jpeg"
    img_bytes = res.read()
    print(f"   [OK] JPEG image received, bytes: {len(img_bytes)}")
    assert len(img_bytes) > 5000

    print("4. Testing Live Screen Feed Endpoint for Remote Workstation DEL-ENG-WS02...")
    res = urllib.request.urlopen(f"{SERVER_URL}/api/fleet/live-screen/DEL-ENG-WS02")
    assert res.headers.get("Content-Type") == "image/jpeg"
    img_bytes2 = res.read()
    print(f"   [OK] Remote workstation simulated frame received, bytes: {len(img_bytes2)}")
    assert len(img_bytes2) > 5000

    print("\nALL EMPLOYEE ONBOARDING & LIVE SCREEN FEED TESTS PASSED! 100% READY!")

if __name__ == "__main__":
    test_flow()
