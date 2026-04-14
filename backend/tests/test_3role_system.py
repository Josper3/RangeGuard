"""
Backend API tests for 3-role system (Federation, Society, Hiker)
Tests auth flows, role-based access, society approval, activity management
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://cotos-check.preview.emergentagent.com')

# Test credentials
FEDERATION_EMAIL = "federacion@rangeguard.com"
FEDERATION_PASSWORD = "federacion2024"
HIKER_EMAIL = "senderista@test.com"
HIKER_PASSWORD = "test1234"
SOCIETY_EMAIL = "sociedad@test.com"
SOCIETY_PASSWORD = "test1234"


class TestHealthAndStats:
    """Basic health and stats endpoints"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"API root: {data}")
    
    def test_stats_endpoint(self):
        """Test stats endpoint returns expected fields"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_zones" in data
        assert "active_zones" in data
        assert "total_users" in data
        assert "total_routes" in data
        print(f"Stats: {data}")
    
    def test_constants_endpoint(self):
        """Test constants endpoint returns species and roles"""
        response = requests.get(f"{BASE_URL}/api/constants")
        assert response.status_code == 200
        data = response.json()
        assert "species" in data
        assert "weight_ranges" in data
        assert "participant_roles" in data
        assert "auth_types" in data
        print(f"Constants: species={len(data['species'])}, roles={len(data['participant_roles'])}")


class TestFederationAuth:
    """Federation (admin) authentication tests"""
    
    def test_federation_login_success(self):
        """Test federation login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FEDERATION_EMAIL,
            "password": FEDERATION_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "federation"
        assert data["user"]["email"] == FEDERATION_EMAIL
        print(f"Federation login success: {data['user']['name']}")
        return data["token"]
    
    def test_federation_login_wrong_password(self):
        """Test federation login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FEDERATION_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("Federation wrong password correctly rejected")
    
    def test_federation_me_endpoint(self):
        """Test /auth/me returns federation user data"""
        # First login
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FEDERATION_EMAIL,
            "password": FEDERATION_PASSWORD
        })
        token = login_res.json()["token"]
        
        # Then get me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "federation"
        assert "password_hash" not in data
        print(f"Federation /me: {data['email']}, role={data['role']}")


class TestHikerAuth:
    """Hiker authentication and registration tests"""
    
    def test_hiker_registration_or_login(self):
        """Test hiker registration (or login if already exists)"""
        # Try to register
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": HIKER_EMAIL,
            "password": HIKER_PASSWORD,
            "name": "Test Hiker",
            "role": "hiker"
        })
        
        if response.status_code == 400 and "already registered" in response.json().get("detail", ""):
            # Already exists, try login
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": HIKER_EMAIL,
                "password": HIKER_PASSWORD
            })
            assert response.status_code == 200
            print("Hiker already exists, login successful")
        else:
            assert response.status_code == 200
            print("Hiker registration successful")
        
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "hiker"
        assert data["user"]["approved"] == True  # Hikers are auto-approved
        return data["token"]
    
    def test_hiker_cannot_access_federation_endpoints(self):
        """Test hiker cannot access federation-only endpoints"""
        # Login as hiker
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": HIKER_EMAIL,
            "password": HIKER_PASSWORD
        })
        if login_res.status_code != 200:
            pytest.skip("Hiker not registered yet")
        
        token = login_res.json()["token"]
        
        # Try to access federation societies endpoint
        response = requests.get(f"{BASE_URL}/api/federation/societies", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 403
        print("Hiker correctly blocked from federation endpoints")
    
    def test_hiker_cannot_access_society_endpoints(self):
        """Test hiker cannot create activities (society-only)"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": HIKER_EMAIL,
            "password": HIKER_PASSWORD
        })
        if login_res.status_code != 200:
            pytest.skip("Hiker not registered yet")
        
        token = login_res.json()["token"]
        
        # Try to create activity
        response = requests.post(f"{BASE_URL}/api/activities", json={
            "activity_type": "batida",
            "coto_name": "Test"
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403
        print("Hiker correctly blocked from creating activities")


class TestSocietyAuth:
    """Society authentication and registration tests"""
    
    def test_society_registration_or_login(self):
        """Test society registration (or login if already exists)"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": SOCIETY_EMAIL,
            "password": SOCIETY_PASSWORD,
            "name": "Test Society Admin",
            "role": "society",
            "society_name": "Sociedad de Caza Sierra",
            "cif": "B12345678",
            "responsible_name": "Juan Garcia",
            "responsible_phone": "600123456"
        })
        
        if response.status_code == 400 and "already registered" in response.json().get("detail", ""):
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": SOCIETY_EMAIL,
                "password": SOCIETY_PASSWORD
            })
            assert response.status_code == 200
            print("Society already exists, login successful")
        else:
            assert response.status_code == 200
            print("Society registration successful")
        
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "society"
        # Society may or may not be approved
        print(f"Society approved status: {data['user'].get('approved', False)}")
        return data
    
    def test_society_cannot_access_federation_endpoints(self):
        """Test society cannot access federation-only endpoints"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SOCIETY_EMAIL,
            "password": SOCIETY_PASSWORD
        })
        if login_res.status_code != 200:
            pytest.skip("Society not registered yet")
        
        token = login_res.json()["token"]
        
        response = requests.get(f"{BASE_URL}/api/federation/societies", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 403
        print("Society correctly blocked from federation endpoints")


class TestFederationSocietyManagement:
    """Federation managing societies (approve/reject)"""
    
    @pytest.fixture
    def federation_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FEDERATION_EMAIL,
            "password": FEDERATION_PASSWORD
        })
        return response.json()["token"]
    
    def test_federation_list_societies(self, federation_token):
        """Test federation can list all societies"""
        response = requests.get(f"{BASE_URL}/api/federation/societies", headers={
            "Authorization": f"Bearer {federation_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Federation sees {len(data)} societies")
        for soc in data:
            print(f"  - {soc.get('society_name', soc.get('name'))}: approved={soc.get('approved')}")
        return data
    
    def test_federation_approve_society(self, federation_token):
        """Test federation can approve a society"""
        # First get societies
        societies_res = requests.get(f"{BASE_URL}/api/federation/societies", headers={
            "Authorization": f"Bearer {federation_token}"
        })
        societies = societies_res.json()
        
        # Find unapproved society
        unapproved = [s for s in societies if not s.get("approved")]
        if not unapproved:
            print("No unapproved societies to test approval")
            # Try to approve the test society anyway
            test_society = [s for s in societies if s.get("email") == SOCIETY_EMAIL]
            if test_society:
                society_id = test_society[0]["id"]
                response = requests.put(f"{BASE_URL}/api/federation/societies/{society_id}/approve", 
                    headers={"Authorization": f"Bearer {federation_token}"})
                # May return 200 or 404 if already approved
                print(f"Approve test society result: {response.status_code}")
            return
        
        society_id = unapproved[0]["id"]
        response = requests.put(f"{BASE_URL}/api/federation/societies/{society_id}/approve", 
            headers={"Authorization": f"Bearer {federation_token}"})
        assert response.status_code == 200
        print(f"Society {society_id} approved successfully")


class TestFederationActivityManagement:
    """Federation managing activities (approve/reject)"""
    
    @pytest.fixture
    def federation_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FEDERATION_EMAIL,
            "password": FEDERATION_PASSWORD
        })
        return response.json()["token"]
    
    def test_federation_list_activities(self, federation_token):
        """Test federation can list all activities"""
        response = requests.get(f"{BASE_URL}/api/federation/activities", headers={
            "Authorization": f"Bearer {federation_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Federation sees {len(data)} activities")
        for act in data[:5]:  # Show first 5
            print(f"  - {act.get('coto_name', 'unnamed')}: status={act.get('status')}, type={act.get('activity_type')}")
        return data
    
    def test_federation_filter_pending_activities(self, federation_token):
        """Test federation can filter pending activities"""
        response = requests.get(f"{BASE_URL}/api/federation/activities?status=pending", headers={
            "Authorization": f"Bearer {federation_token}"
        })
        assert response.status_code == 200
        data = response.json()
        for act in data:
            assert act["status"] == "pending"
        print(f"Found {len(data)} pending activities")


class TestSocietyActivityManagement:
    """Society creating and managing activities"""
    
    @pytest.fixture
    def society_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SOCIETY_EMAIL,
            "password": SOCIETY_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Society not registered")
        return response.json()["token"]
    
    @pytest.fixture
    def approved_society_token(self, society_token):
        """Ensure society is approved before testing activities"""
        # Check if approved
        me_res = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {society_token}"
        })
        if not me_res.json().get("approved"):
            # Try to approve via federation
            fed_res = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": FEDERATION_EMAIL,
                "password": FEDERATION_PASSWORD
            })
            fed_token = fed_res.json()["token"]
            
            societies_res = requests.get(f"{BASE_URL}/api/federation/societies", headers={
                "Authorization": f"Bearer {fed_token}"
            })
            test_soc = [s for s in societies_res.json() if s.get("email") == SOCIETY_EMAIL]
            if test_soc:
                requests.put(f"{BASE_URL}/api/federation/societies/{test_soc[0]['id']}/approve",
                    headers={"Authorization": f"Bearer {fed_token}"})
                print("Society approved for testing")
        return society_token
    
    def test_society_list_own_activities(self, approved_society_token):
        """Test society can list their own activities"""
        response = requests.get(f"{BASE_URL}/api/activities", headers={
            "Authorization": f"Bearer {approved_society_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Society has {len(data)} activities")
    
    def test_society_create_draft_activity(self, approved_society_token):
        """Test society can create a draft activity"""
        response = requests.post(f"{BASE_URL}/api/activities", json={
            "activity_type": "batida",
            "coto_name": f"Test Coto {uuid.uuid4().hex[:6]}",
            "coto_matricula": "MU-12345",
            "responsible_name": "Juan Test",
            "responsible_dni": "12345678A",
            "responsible_phone": "600111222",
            "date": "2026-05-01",
            "partida_paraje": "Sierra Norte",
            "termino_municipal": "Murcia",
            "start_time": "2026-05-01T08:00:00",
            "end_time": "2026-05-01T14:00:00",
            "authorization_type": "ptoc_comunicacion",
            "authorized_species": ["jabali", "zorro"],
            "status": "draft"
        }, headers={"Authorization": f"Bearer {approved_society_token}"})
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "draft"
        assert data["activity_type"] == "batida"
        print(f"Created draft activity: {data['id']}")
        return data["id"]


class TestRegularParticipants:
    """Society managing regular participants"""
    
    @pytest.fixture
    def society_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SOCIETY_EMAIL,
            "password": SOCIETY_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Society not registered")
        return response.json()["token"]
    
    def test_get_regular_participants(self, society_token):
        """Test society can get their regular participants"""
        response = requests.get(f"{BASE_URL}/api/regular-participants", headers={
            "Authorization": f"Bearer {society_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Society has {len(data)} regular participants")
    
    def test_add_regular_participant(self, society_token):
        """Test society can add a regular participant"""
        response = requests.post(f"{BASE_URL}/api/regular-participants", json={
            "name": f"Participante Test {uuid.uuid4().hex[:4]}",
            "dni": "87654321B",
            "phone": "600333444",
            "default_role": "batidor",
            "dog_count": 2
        }, headers={"Authorization": f"Bearer {society_token}"})
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["name"].startswith("Participante Test")
        print(f"Added regular participant: {data['id']}")


class TestMapAndZones:
    """Map data and zones endpoints (public)"""
    
    def test_get_zones(self):
        """Test zones endpoint returns approved activities as zones"""
        response = requests.get(f"{BASE_URL}/api/zones")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} zones")
        for zone in data[:3]:
            print(f"  - {zone.get('name', 'unnamed')}: {zone.get('activity_type', 'legacy')}")
    
    def test_get_public_routes(self):
        """Test public routes endpoint"""
        response = requests.get(f"{BASE_URL}/api/routes/public")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} public routes")


class TestRoleBasedAccess:
    """Comprehensive role-based access control tests"""
    
    def test_unauthenticated_cannot_access_protected(self):
        """Test unauthenticated requests are rejected"""
        endpoints = [
            ("GET", "/api/auth/me"),
            ("GET", "/api/activities"),
            ("GET", "/api/notifications"),
            ("GET", "/api/federation/societies"),
        ]
        for method, endpoint in endpoints:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code == 401, f"{endpoint} should require auth"
        print("All protected endpoints correctly require authentication")
    
    def test_invalid_token_rejected(self):
        """Test invalid tokens are rejected"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": "Bearer invalid_token_here"
        })
        assert response.status_code == 401
        print("Invalid token correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
