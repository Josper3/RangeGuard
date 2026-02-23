#!/usr/bin/env python3
import requests
import sys
import json
import uuid
from datetime import datetime, timezone

class HuntingSafetyAPITester:
    def __init__(self, base_url="https://cotos-check.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.user_id = None

    def log_test(self, name, success, response=None, status_code=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED")
            if status_code:
                print(f"   Status: {status_code}")
            if response:
                print(f"   Response: {response}")
            self.failed_tests.append(f"{name}: {status_code} - {response}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        
        # Default headers
        test_headers = {'Content-Type': 'application/json'}
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                self.log_test(name, True)
                try:
                    return True, response.json() if response.text else {}
                except:
                    return True, {}
            else:
                self.log_test(name, False, response.text, response.status_code)
                return False, {}

        except Exception as e:
            self.log_test(name, False, str(e))
            return False, {}

    def test_stats_endpoint(self):
        """Test GET /api/stats"""
        success, response = self.run_test(
            "Stats API",
            "GET",
            "stats",
            200
        )
        if success:
            expected_keys = ["total_zones", "active_zones", "total_users", "total_routes"]
            missing_keys = [k for k in expected_keys if k not in response]
            if missing_keys:
                print(f"   Warning: Missing keys in stats: {missing_keys}")
                return False
            print(f"   Stats: {response}")
        return success

    def test_admin_registration(self):
        """Test POST /api/auth/register for admin user"""
        admin_data = {
            "email": "admin@test.com",
            "password": "test1234",
            "name": "Test Admin",
            "role": "admin",
            "organization_name": "Test Hunting Association",
            "cif": "B12345678"
        }
        
        success, response = self.run_test(
            "Admin Registration",
            "POST",
            "auth/register",
            200,
            admin_data
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Admin registered with ID: {self.user_id}")
        
        return success

    def test_login(self):
        """Test POST /api/auth/login"""
        login_data = {
            "email": "admin@test.com",
            "password": "test1234"
        }
        
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            login_data
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Login successful, token received")
        
        return success

    def test_get_me(self):
        """Test GET /api/auth/me"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        
        if success:
            expected_keys = ["id", "email", "name", "role"]
            missing_keys = [k for k in expected_keys if k not in response]
            if missing_keys:
                print(f"   Warning: Missing keys in user data: {missing_keys}")
                return False
            print(f"   User: {response.get('name')} ({response.get('role')})")
        
        return success

    def test_create_zone(self):
        """Test POST /api/zones"""
        # Sample polygon geometry (rough square around Madrid)
        zone_data = {
            "name": "Sierra Norte Coto",
            "description": "Test hunting zone in Sierra Norte",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-3.8, 40.6],
                    [-3.6, 40.6],
                    [-3.6, 40.4],
                    [-3.8, 40.4],
                    [-3.8, 40.6]
                ]]
            },
            "start_time": "2024-01-01T08:00:00Z",
            "end_time": "2026-12-31T18:00:00Z",
            "buffer_meters": 200
        }
        
        success, response = self.run_test(
            "Create Zone",
            "POST",
            "zones",
            200,
            zone_data
        )
        
        if success:
            self.zone_id = response.get('id')
            print(f"   Zone created with ID: {self.zone_id}")
        
        return success

    def test_get_zones_active(self):
        """Test GET /api/zones?active=true"""
        success, response = self.run_test(
            "Get Active Zones",
            "GET",
            "zones?active=true",
            200
        )
        
        if success:
            print(f"   Found {len(response)} active zones")
            if len(response) > 0:
                zone = response[0]
                expected_keys = ["id", "name", "geometry", "start_time", "end_time"]
                missing_keys = [k for k in expected_keys if k not in zone]
                if missing_keys:
                    print(f"   Warning: Missing keys in zone data: {missing_keys}")
        
        return success

    def test_intersection_check(self):
        """Test POST /api/check-intersection with geometry validation"""
        # Test route that intersects with existing zones
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-3.7, 40.5],  # Start point inside potential zone
                [-3.5, 40.3]   # End point outside zone
            ]
        }
        
        intersection_data = {
            "route_geometry": route_geometry
        }
        
        success, response = self.run_test(
            "Check Route Intersection",
            "POST",
            "check-intersection",
            200,
            intersection_data
        )
        
        if success:
            expected_keys = ["intersects", "zones", "safe_message"]
            missing_keys = [k for k in expected_keys if k not in response]
            if missing_keys:
                print(f"   Warning: Missing keys in intersection response: {missing_keys}")
                return False
            
            print(f"   Intersects: {response.get('intersects')}")
            print(f"   Zones found: {len(response.get('zones', []))}")
            print(f"   Message: {response.get('safe_message')}")
            
            # Validate zone data includes geometry and buffered_geometry
            zones = response.get('zones', [])
            for i, zone in enumerate(zones):
                expected_zone_keys = ["zone_id", "zone_name", "association", "overlap_percentage", "geometry", "buffered_geometry"]
                missing_zone_keys = [k for k in expected_zone_keys if k not in zone]
                if missing_zone_keys:
                    print(f"   Warning: Zone {i} missing keys: {missing_zone_keys}")
                else:
                    print(f"   Zone {i}: {zone.get('zone_name')} - {zone.get('overlap_percentage')}% overlap")
                    print(f"   Zone {i}: Has geometry: {bool(zone.get('geometry'))}, Has buffered_geometry: {bool(zone.get('buffered_geometry'))}")
        
        return success

    def test_user_registration(self):
        """Test regular user registration"""
        user_data = {
            "email": "hiker@test.com",
            "password": "test1234",
            "name": "Test Hiker",
            "role": "user"
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            user_data
        )
        
    def test_pdf_generation(self):
        """Test POST /api/reports/pdf"""
        # Test PDF generation with same route geometry
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-3.7, 40.5],  # Start point inside potential zone
                [-3.5, 40.3]   # End point outside zone
            ]
        }
        
        pdf_data = {
            "route_geometry": route_geometry
        }
        
        print(f"\n🔍 Testing PDF Generation...")
        url = f"{self.api_url}/reports/pdf"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        try:
            response = requests.post(url, json=pdf_data, headers=headers, timeout=30)
            success = response.status_code == 200
            
            if success:
                # Check if response is PDF content
                is_pdf = response.headers.get('content-type') == 'application/pdf'
                pdf_size = len(response.content)
                
                self.log_test("PDF Generation", success)
                print(f"   PDF Content Type: {response.headers.get('content-type')}")
                print(f"   PDF Size: {pdf_size} bytes")
                print(f"   Is Valid PDF: {is_pdf}")
                
                return success and is_pdf and pdf_size > 1000  # Basic validation
            else:
                self.log_test("PDF Generation", False, response.text, response.status_code)
                return False
                
        except Exception as e:
            self.log_test("PDF Generation", False, str(e))
            return False
        return success

    def run_all_tests(self):
        """Run all backend tests"""
        print("="*60)
        print("🚀 Starting RangeGuard Backend API Tests")
        print(f"📍 Base URL: {self.base_url}")
        print("="*60)

        # Test basic endpoints that don't require auth
        self.test_stats_endpoint()
        
        # Test authentication flow
        self.test_admin_registration()
        
        # Try login (in case admin already exists)
        if not self.token:
            self.test_login()
        
        if not self.token:
            print("❌ Cannot proceed without authentication token")
            return False
        
        # Test authenticated endpoints
        self.test_get_me()
        self.test_create_zone()
        self.test_get_zones_active()
        self.test_intersection_check()
        self.test_pdf_generation()
        self.test_user_registration()

        # Print results
        print("\n" + "="*60)
        print("📊 TEST RESULTS")
        print("="*60)
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        print("="*60)

        return self.tests_passed == self.tests_run

def main():
    tester = RangeGuardAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())