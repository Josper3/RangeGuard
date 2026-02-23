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

    def test_login_hiker(self):
        """Test login with hiker@test.com/test1234"""
        login_data = {
            "email": "hiker@test.com",
            "password": "test1234"
        }
        
        success, response = self.run_test(
            "Hiker Login",
            "POST",
            "auth/login",
            200,
            login_data
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Hiker login successful, token received")
        
        return success

    def test_public_routes(self):
        """Test GET /api/routes/public returns public routes with owner_name and point_count"""
        success, response = self.run_test(
            "Get Public Routes",
            "GET",
            "routes/public",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} public routes")
            if response:
                sample_route = response[0]
                expected_fields = ['id', 'name', 'owner_name', 'point_count']
                missing_fields = [f for f in expected_fields if f not in sample_route]
                if missing_fields:
                    print(f"   ⚠️  Missing required fields in route: {missing_fields}")
                    self.failed_tests.append(f"Public routes missing fields: {missing_fields}")
                    return False
                else:
                    print(f"   ✅ Route has required fields: owner_name='{sample_route.get('owner_name')}', point_count={sample_route.get('point_count')}")
        
        return success

    def test_public_routes_search(self):
        """Test GET /api/routes/public?search=Sierra returns filtered results"""
        success, response = self.run_test(
            "Search Public Routes (search=Sierra)",
            "GET",
            "routes/public?search=Sierra",
            200
        )
        
        if success:
            print(f"   Found {len(response)} routes matching 'Sierra'")
        
        return success

    def test_add_favorite(self, route_id):
        """Test POST /api/favorites/{route_id} adds route to favorites"""
        success, response = self.run_test(
            f"Add Favorite Route {route_id}",
            "POST",
            f"favorites/{route_id}",
            200
        )
        
        if success:
            expected_fields = ['id', 'user_id', 'route_id', 'route_name', 'owner_name']
            missing_fields = [f for f in expected_fields if f not in response]
            if missing_fields:
                print(f"   ⚠️  Missing fields in favorite response: {missing_fields}")
                self.failed_tests.append(f"Add favorite missing fields: {missing_fields}")
                return False
        
        return success

    def test_get_favorites(self):
        """Test GET /api/favorites returns user's favorited routes with geometry"""
        success, response = self.run_test(
            "Get User Favorites",
            "GET",
            "favorites",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} favorite routes")
            if response:
                sample_fav = response[0]
                expected_fields = ['favorite_id', 'route_id', 'route_name', 'owner_name', 'geometry']
                missing_fields = [f for f in expected_fields if f not in sample_fav]
                if missing_fields:
                    print(f"   ⚠️  Missing required fields in favorite: {missing_fields}")
                    self.failed_tests.append(f"Favorites missing fields: {missing_fields}")
                    return False
                else:
                    print(f"   ✅ Favorite has required fields including geometry")
                    # Check if geometry is valid
                    geometry = sample_fav.get('geometry', {})
                    if not geometry or 'coordinates' not in geometry:
                        print(f"   ⚠️  Invalid geometry in favorite")
                        self.failed_tests.append("Favorites missing valid geometry")
                        return False
        
        return success

    def test_get_favorite_ids(self):
        """Test GET /api/favorites/ids returns array of favorited route IDs"""
        success, response = self.run_test(
            "Get Favorite IDs",
            "GET",
            "favorites/ids",
            200
        )
        
        if success:
            if not isinstance(response, list):
                print(f"   ⚠️  Response should be an array, got {type(response)}")
                self.failed_tests.append("Favorite IDs should return array")
                return False
            print(f"   Found {len(response)} favorite route IDs")
        
        return success

    def test_remove_favorite(self, route_id):
        """Test DELETE /api/favorites/{route_id} removes from favorites"""
        success, response = self.run_test(
            f"Remove Favorite Route {route_id}",
            "DELETE",
            f"favorites/{route_id}",
            200
        )
        
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